import { App } from "aws-cdk-lib";
import { HiramekiRelayStack } from "../lib/hirameki-relay-stack";

const app = new App();

new HiramekiRelayStack(app, "HiramekiRelayStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1"
  }
});
