import { connectSlackCredentials } from "@vercel/connect/ash";
import { slackChannel } from "experimental-ash/channels/slack";

export default slackChannel({
  botName: "triage-agent",
  credentials: connectSlackCredentials("slack/triage-agent"),
});
