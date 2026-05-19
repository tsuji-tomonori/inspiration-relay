import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, it } from "vitest";
import { HiramekiRelayStack } from "../lib/hirameki-relay-stack";

const cachingDisabledPolicyId = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad";
const allCloudFrontMethods = ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"];

describe("spec compliance: infrastructure", () => {
  it("defines the game and connection DynamoDB tables with TTL and the specified keys", () => {
    const template = synthTemplate();

    template.resourceCountIs("AWS::DynamoDB::Table", 2);
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: Match.arrayWith([
        Match.objectLike({ AttributeName: "PK", KeyType: "HASH" }),
        Match.objectLike({ AttributeName: "SK", KeyType: "RANGE" })
      ]),
      TimeToLiveSpecification: {
        AttributeName: "ttl",
        Enabled: true
      }
    });
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: Match.arrayWith([
        Match.objectLike({ AttributeName: "connectionId", KeyType: "HASH" })
      ]),
      TimeToLiveSpecification: {
        AttributeName: "ttl",
        Enabled: true
      },
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: "ByRoom",
          KeySchema: Match.arrayWith([
            Match.objectLike({ AttributeName: "GSI1PK", KeyType: "HASH" }),
            Match.objectLike({ AttributeName: "GSI1SK", KeyType: "RANGE" })
          ])
        })
      ])
    });
  });

  it("keeps the SPA bucket private and serves it only through CloudFront OAC", () => {
    const template = synthTemplate();

    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: "AES256"
            }
          })
        ])
      }
    });
    template.hasResourceProperties("AWS::CloudFront::OriginAccessControl", {
      OriginAccessControlConfig: Match.objectLike({
        OriginAccessControlOriginType: "s3",
        SigningBehavior: "always",
        SigningProtocol: "sigv4"
      })
    });
  });

  it("routes SPA, REST API, and WebSocket traffic through one CloudFront distribution", () => {
    const template = synthTemplate();

    template.resourceCountIs("AWS::CloudFront::Distribution", 1);
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: "index.html",
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: "redirect-to-https"
        }),
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: "api/*",
            AllowedMethods: Match.arrayWith(allCloudFrontMethods),
            CachePolicyId: cachingDisabledPolicyId,
            ViewerProtocolPolicy: "redirect-to-https"
          }),
          Match.objectLike({
            PathPattern: "ws/*",
            AllowedMethods: Match.arrayWith(allCloudFrontMethods),
            CachePolicyId: cachingDisabledPolicyId,
            ViewerProtocolPolicy: "redirect-to-https"
          })
        ])
      })
    });
    template.hasResourceProperties("AWS::CloudFront::Function", {
      FunctionCode: Match.stringLikeRegexp('!uri\.startsWith\\("/api/"\\)'),
      AutoPublish: true
    });
  });

  it("provisions HTTP and WebSocket APIs backed by Lambda without login infrastructure", () => {
    const template = synthTemplate();

    template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      Name: "hirameki-relay-http-api",
      ProtocolType: "HTTP"
    });
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "ANY /api/{proxy+}",
      AuthorizationType: "NONE"
    });
    template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      Name: "hirameki-relay-websocket-api",
      ProtocolType: "WEBSOCKET"
    });
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: "$connect" });
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: "$disconnect" });
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: "$default" });
    template.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      StageName: "v1",
      AutoDeploy: true
    });

    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "handler.handler",
      Runtime: "nodejs22.x",
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          GAME_TABLE_NAME: Match.anyValue(),
          CONNECTION_TABLE_NAME: Match.anyValue(),
          WEBSOCKET_URL: Match.anyValue(),
          WEBSOCKET_MANAGEMENT_ENDPOINT: Match.anyValue()
        })
      })
    });
    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "ws-handler.connectHandler",
      Runtime: "nodejs22.x",
      Environment: Match.objectLike({
        Variables: Match.objectLike({ CONNECTION_TABLE_NAME: Match.anyValue() })
      })
    });

    template.resourceCountIs("AWS::Cognito::UserPool", 0);
    template.resourceCountIs("AWS::Cognito::UserPoolClient", 0);
  });
});

function synthTemplate(): Template {
  const app = new App();
  const stack = new HiramekiRelayStack(app, "SpecComplianceStack");
  return Template.fromStack(stack);
}
