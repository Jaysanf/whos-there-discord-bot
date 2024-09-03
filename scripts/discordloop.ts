import dotenv from "dotenv";
dotenv.config();
import {
  Client,
  IntentsBitField,
  PermissionsBitField
} from 'discord.js';
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, QueryCommand} from "@aws-sdk/lib-dynamodb";
import {GetParameterCommand, SSMClient} from "@aws-sdk/client-ssm";

// Initialize DynamoDB client and document client
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const TABLE_NAME = 'GuildUser'; // Replace with your actual table name

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";

class WhosThereBot {
  private token: string;
  private client: Client;

  constructor() {
    this.token = DISCORD_BOT_TOKEN;
    const intents = new IntentsBitField([
      IntentsBitField.Flags.Guilds,
      IntentsBitField.Flags.GuildMembers,
      IntentsBitField.Flags.GuildPresences,
      IntentsBitField.Flags.GuildVoiceStates,
      IntentsBitField.Flags.DirectMessages,
      IntentsBitField.Flags.GuildMessages,
      IntentsBitField.Flags.MessageContent,
    ]);

    this.client = new Client({ intents });

    this.client.on('voiceStateUpdate', async (before, after) => {
      const userSubscribedRecords = await this.getUsersByGuildId(after.guild.id.toString());
      for (const record of userSubscribedRecords) {
        const userId = record.userId;
        const user = await this.client.users.fetch(userId);

        if (userId === after.member?.id.toString()) continue;

        const dmChannel = await user.createDM();

        // User joined a voice channel
        if (!before.channel && after.channel) {
          const member1 = after.guild.members.cache.get(userId);
          if (member1 && after.channel.permissionsFor(member1)?.has(PermissionsBitField.Flags.ViewChannel)) {
            await dmChannel.send(`User **${after.member?.displayName}** has joined **${after.channel.name}** in **${after.guild.name}**`);
          }
        }

        // User left a voice channel
        if (before.channel && !after.channel) {
          const member1 = before.guild.members.cache.get(userId);
          if (member1 && before.channel.permissionsFor(member1)?.has(PermissionsBitField.Flags.ViewChannel)) {
            await dmChannel.send(`User **${before.member?.displayName}** has left **${before.channel.name}** in **${before.guild.name}**`);
          }
        }
      }
    });
  }

  public runMainLoop() {
    this.client.login(this.token);
  }

  getUsersByGuildId(guildId: string): Promise<Record<string, any>[]> {
    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: "guildId = :g",
      ExpressionAttributeValues: {
        ":g": guildId,
      },
    };
  
    return docClient.send(new QueryCommand(params))
      .then((output) => output.Items || [])
      .catch(() => []);
  }
}

const whosThereBot = new WhosThereBot();
if (!DISCORD_BOT_TOKEN) {
  console.log(DISCORD_BOT_TOKEN);
  throw new Error("DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN must be set");
}
whosThereBot.runMainLoop();