import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { HiramekiRelayStack } from "../lib/hirameki-relay-stack";

type CloudFormationResource = {
  Type?: string;
  Properties?: Record<string, unknown>;
  DeletionPolicy?: string;
  UpdateReplacePolicy?: string;
};

function synthesize() {
  const app = new App();
  const stack = new HiramekiRelayStack(app, "TestStack");
  return Template.fromStack(stack);
}

function resourcesOf(template: Template, type: string): CloudFormationResource[] {
  return Object.values(template.toJSON().Resources ?? {}).filter(
    (resource): resource is CloudFormationResource =>
      typeof resource === "object" && resource !== null && (resource as CloudFormationResource).Type === type
  );
}

function findResource(template: Template, type: string, predicate: (resource: CloudFormationResource) => boolean) {
  const resource = resourcesOf(template, type).find(predicate);
  expect(resource).toBeDefined();
  return resource as CloudFormationResource;
}

function stabilizeTemplate(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stabilizeTemplate);
  }
  if (!value || typeof value !== "object") {
    return stabilizeScalar(value);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "Metadata")
      .map(([key, nested]) => [key, stabilizeTemplate(nested)])
  );
}

function stabilizeScalar(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  return value
    .replace(/asset\.[0-9a-f]{64}/g, "asset.<hash>")
    .replace(/[0-9a-f]{64}\.zip/g, "<asset-hash>.zip");
}

describe("HiramekiRelayStack", () => {
  it("defines serverless app resources without Cognito", () => {
    const template = synthesize();

    template.resourceCountIs("AWS::DynamoDB::Table", 2);
    template.resourceCountIs("AWS::ApiGatewayV2::Api", 2);
    expect(JSON.stringify(template.toJSON())).not.toContain("AWS::Cognito");
  });

  it("keeps the synthesized CloudFormation template stable", () => {
    const template = synthesize();

    expect(stabilizeTemplate(template.toJSON())).toMatchSnapshot();
  });

  it("keeps the site bucket private, encrypted, retained, and SSL-only", () => {
    const template = synthesize();
    const siteBucket = findResource(
      template,
      "AWS::S3::Bucket",
      (resource) => resource.Properties?.PublicAccessBlockConfiguration !== undefined
    );

    expect(siteBucket).toEqual(
      expect.objectContaining({
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: expect.objectContaining({
          BucketEncryption: {
            ServerSideEncryptionConfiguration: [
              {
                ServerSideEncryptionByDefault: {
                  SSEAlgorithm: "AES256"
                }
              }
            ]
          },
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true
          }
        })
      })
    );

    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "s3:*",
            Condition: {
              Bool: {
                "aws:SecureTransport": "false"
              }
            },
            Effect: "Deny",
            Principal: {
              AWS: "*"
            }
          })
        ])
      })
    });
  });

  it("defines DynamoDB tables with on-demand billing, TTL, and room lookup index", () => {
    const template = synthesize();

    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" }
      ],
      TimeToLiveSpecification: {
        AttributeName: "ttl",
        Enabled: true
      }
    });
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [{ AttributeName: "connectionId", KeyType: "HASH" }],
      GlobalSecondaryIndexes: [
        Match.objectLike({
          IndexName: "ByRoom",
          KeySchema: [
            { AttributeName: "GSI1PK", KeyType: "HASH" },
            { AttributeName: "GSI1SK", KeyType: "RANGE" }
          ]
        })
      ],
      TimeToLiveSpecification: {
        AttributeName: "ttl",
        Enabled: true
      }
    });

    for (const table of resourcesOf(template, "AWS::DynamoDB::Table")) {
      expect(table).toEqual(
        expect.objectContaining({
          DeletionPolicy: "Retain",
          UpdateReplacePolicy: "Retain"
        })
      );
    }
  });

  it("sends application Lambda logs to one JSON CloudWatch Logs group", () => {
    const template = synthesize();

    template.resourceCountIs("AWS::Logs::LogGroup", 1);
    template.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: "/hirameki-relay/lambda",
      RetentionInDays: 731
    });
    template.resourcePropertiesCountIs(
      "AWS::Lambda::Function",
      {
        LoggingConfig: {
          LogFormat: "JSON",
          LogGroup: {
            Ref: Match.stringLikeRegexp("ApplicationLambdaLogGroup")
          }
        }
      },
      4
    );
  });

  it("uses valid Node.js Lambda handler names", () => {
    const template = synthesize();

    template.hasResourceProperties("AWS::Lambda::Function", {
      Architectures: ["arm64"],
      Handler: "handler.handler",
      MemorySize: 256,
      Timeout: 10,
      Runtime: "nodejs22.x"
    });
    template.hasResourceProperties("AWS::Lambda::Function", {
      Architectures: ["arm64"],
      Handler: "ws-handler.connectHandler",
      Timeout: 5,
      Runtime: "nodejs22.x"
    });
    template.hasResourceProperties("AWS::Lambda::Function", {
      Architectures: ["arm64"],
      Handler: "ws-handler.disconnectHandler",
      Timeout: 5,
      Runtime: "nodejs22.x"
    });
    template.hasResourceProperties("AWS::Lambda::Function", {
      Architectures: ["arm64"],
      Handler: "ws-handler.messageHandler",
      Timeout: 10,
      Runtime: "nodejs22.x"
    });
  });

  it("wires Lambda environment variables and DynamoDB permissions to the expected stores", () => {
    const template = synthesize();

    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "handler.handler",
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          GAME_TABLE_NAME: Match.anyValue(),
          CONNECTION_TABLE_NAME: Match.anyValue()
        })
      })
    });
    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "ws-handler.connectHandler",
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          CONNECTION_TABLE_NAME: Match.anyValue()
        })
      })
    });
    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "ws-handler.messageHandler",
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          GAME_TABLE_NAME: Match.anyValue(),
          CONNECTION_TABLE_NAME: Match.anyValue()
        })
      })
    });

    template.resourcePropertiesCountIs(
      "AWS::IAM::Policy",
      {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"])
            })
          ])
        })
      },
      4
    );
  });

  it("allows API Lambda to notify websocket room connections", () => {
    const template = synthesize();
    const synthesized = template.toJSON();

    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "handler.handler",
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          WEBSOCKET_URL: Match.anyValue(),
          WEBSOCKET_MANAGEMENT_ENDPOINT: Match.anyValue()
        })
      })
    });
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "execute-api:ManageConnections",
            Effect: "Allow"
          })
        ])
      })
    });

    const apiFunction = Object.values(synthesized.Resources).find(
      (resource) =>
        typeof resource === "object" &&
        resource !== null &&
        (resource as { Type?: string; Properties?: { Handler?: string } }).Type === "AWS::Lambda::Function" &&
        (resource as { Properties?: { Handler?: string } }).Properties?.Handler === "handler.handler"
    ) as { Properties: { Environment: { Variables: { WEBSOCKET_URL: unknown; WEBSOCKET_MANAGEMENT_ENDPOINT: unknown } } } };
    expect(apiFunction.Properties.Environment.Variables.WEBSOCKET_URL).not.toBe("/ws/v1");
    expect(JSON.stringify(apiFunction.Properties.Environment.Variables.WEBSOCKET_URL)).toContain("WebSocketApi");
  });

  it("defines HTTP and websocket API routes with the production websocket stage", () => {
    const template = synthesize();

    template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      Name: "hirameki-relay-http-api",
      ProtocolType: "HTTP"
    });
    template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      Name: "hirameki-relay-websocket-api",
      ProtocolType: "WEBSOCKET"
    });
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "ANY /api/{proxy+}"
    });
    for (const routeKey of ["$connect", "$disconnect", "$default"]) {
      template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
        RouteKey: routeKey
      });
    }
    template.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      AutoDeploy: true,
      StageName: "v1"
    });
  });

  it("deploys web assets and serves the SPA from CloudFront", () => {
    const template = synthesize();
    const synthesized = template.toJSON();

    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: "index.html",
        DefaultCacheBehavior: Match.objectLike({
          FunctionAssociations: Match.arrayWith([
            Match.objectLike({
              EventType: "viewer-request"
            })
          ]),
          ViewerProtocolPolicy: "redirect-to-https"
        })
      })
    });

    template.hasResourceProperties("AWS::CloudFront::Function", {
      AutoPublish: true,
      FunctionCode: Match.stringLikeRegexp('request.uri = "/index.html"')
    });

    template.hasResourceProperties("Custom::CDKBucketDeployment", {
      DestinationBucketName: Match.anyValue(),
      DistributionId: Match.anyValue(),
      DistributionPaths: ["/*"]
    });

    template.hasOutput("SiteBucketName", {
      Value: Match.anyValue()
    });
    template.hasOutput("DistributionId", {
      Value: Match.anyValue()
    });
    template.hasOutput("DistributionDomainName", {
      Value: Match.anyValue()
    });

    const distribution = Object.values(synthesized.Resources).find(
      (resource) =>
        typeof resource === "object" &&
        resource !== null &&
        (resource as { Type?: string }).Type === "AWS::CloudFront::Distribution"
    ) as {
      Properties: {
        DistributionConfig: {
          CacheBehaviors?: Array<Record<string, unknown>>;
          Origins?: Array<Record<string, unknown>>;
        };
      };
    };
    const cacheBehaviors = distribution.Properties.DistributionConfig.CacheBehaviors ?? [];

    expect(cacheBehaviors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          PathPattern: "api/*",
          ViewerProtocolPolicy: "redirect-to-https"
        }),
        expect.objectContaining({
          PathPattern: "ws/*",
          ViewerProtocolPolicy: "redirect-to-https"
        })
      ])
    );
    const wsBehavior = cacheBehaviors.find((behavior) => behavior.PathPattern === "ws/*");
    const origins = distribution.Properties.DistributionConfig.Origins ?? [];
    const wsOrigin = origins.find((origin: Record<string, unknown>) => origin.Id === wsBehavior?.TargetOriginId);
    expect(wsOrigin).toEqual(expect.objectContaining({ OriginPath: "/v1" }));
    expect(cacheBehaviors).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ FunctionAssociations: expect.anything() })])
    );
  });

  it("does not create fixed-cost network or datastore resources", () => {
    const template = synthesize().toJSON();
    const fixedCostResourceTypes = new Set([
      "AWS::EC2::NatGateway",
      "AWS::EC2::VPC",
      "AWS::EC2::Subnet",
      "AWS::EC2::EIP",
      "AWS::ElasticLoadBalancingV2::LoadBalancer",
      "AWS::RDS::DBInstance",
      "AWS::RDS::DBCluster",
      "AWS::OpenSearchService::Domain",
      "AWS::Elasticsearch::Domain"
    ]);

    const actualTypes = Object.values(template.Resources ?? {}).map((resource) => (resource as CloudFormationResource).Type);
    expect(actualTypes.filter((type) => type !== undefined && fixedCostResourceTypes.has(type)).sort()).toEqual([]);
    expect(actualTypes.filter((type) => type?.startsWith("AWS::Cognito"))).toEqual([]);
  });
});
