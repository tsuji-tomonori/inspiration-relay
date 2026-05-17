import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { HiramekiRelayStack } from "../lib/hirameki-relay-stack";

describe("HiramekiRelayStack", () => {
  it("defines serverless app resources without Cognito", () => {
    const app = new App();
    const stack = new HiramekiRelayStack(app, "TestStack");
    const template = Template.fromStack(stack);

    template.resourceCountIs("AWS::DynamoDB::Table", 2);
    template.resourceCountIs("AWS::ApiGatewayV2::Api", 2);
    expect(JSON.stringify(template.toJSON())).not.toContain("AWS::Cognito");
  });

  it("sends application Lambda logs to one JSON CloudWatch Logs group", () => {
    const app = new App();
    const stack = new HiramekiRelayStack(app, "TestStack");
    const template = Template.fromStack(stack);

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

  it("deploys web assets and serves the SPA from CloudFront", () => {
    const app = new App();
    const stack = new HiramekiRelayStack(app, "TestStack");
    const template = Template.fromStack(stack);
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
    ) as { Properties: { DistributionConfig: { CacheBehaviors?: Array<Record<string, unknown>> } } };
    const cacheBehaviors = distribution.Properties.DistributionConfig.CacheBehaviors ?? [];

    expect(cacheBehaviors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ PathPattern: "api/*" }),
        expect.objectContaining({ PathPattern: "ws/*" })
      ])
    );
    expect(cacheBehaviors).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ FunctionAssociations: expect.anything() })])
    );
  });
});
