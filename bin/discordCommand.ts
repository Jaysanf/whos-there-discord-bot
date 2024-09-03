#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DiscordCommandStack } from '../lib/discordCommandStack';

const app = new cdk.App();
new DiscordCommandStack(app, 'DiscordCommandStack', {
  discordApplicationId: "/whos-there-discord-bot/dev/DISCORD_APPLICATION_ID",
  discordBotToken: "/whos-there-discord-bot/dev/DISCORD_BOT_TOKEN",
  discordPublicKey: "/whos-there-discord-bot/dev/DISCORD_PUBLIC_KEY",
});