import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { HiramekiRelayStack } from "../lib/hirameki-relay-stack";

describe("HiramekiRelayStack", () => {
  it("defines serverless app resources without Cognito", () => {
    const app = new App();
    const stack = new HiramekiRelayStack(app, "TestStack");
    const template = Template.fromStack(stack);

    template.resourceCountIs("AWS::DynamoDB::Table", 2);
    template.resourceCountIs("AWS::Lambda::Function", 4);
    template.resourceCountIs("AWS::ApiGatewayV2::Api", 2);
    expect(JSON.stringify(template.toJSON())).not.toContain("AWS::Cognito");
  });
});
