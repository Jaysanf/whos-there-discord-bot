import { CommandChatInputAsync } from "serverless-discord/core/command";
import {
  DiscordInteractionApplicationCommand,
  DiscordInteractionResponseData,
} from "serverless-discord/discord/interactions";

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';


// Initialize DynamoDB client and document client
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const TABLE_NAME = 'GuildUser'; // Replace with your actual table name

export class Subscribe extends CommandChatInputAsync {
  constructor() {
    super({
      name: "subscribe",
      description: "Subscribe for notifications for this guild.",
      options: [],
    });
  }

  async handleInteractionAsync(interaction: DiscordInteractionApplicationCommand): Promise<DiscordInteractionResponseData> {
    if (!interaction.guild_id) {
      return { content: "This command needs to be ran inside a Discord Server."};
    }
    if (!interaction.member?.user?.id) {
      return { content: `This command needs to be called by a user with an id.`};
    }

    try {
      // Insert the item into DynamoDB
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          guildId: interaction.guild_id,
          userId: interaction.member.user.id,
        },
      }));

      return { content: `Successfully subscribed to notifications for this guild.` };
    } catch (error) {
      return { content: 'An error occurred while processing your request.' };
    }
  }
}

export class Unsubscribe extends CommandChatInputAsync {
  constructor() {
    super({
      name: "unsubscribe",
      description: "Unsubscribe for notifications for this guild.",
      options: [],
    });
  }

  async handleInteractionAsync(interaction: DiscordInteractionApplicationCommand): Promise<DiscordInteractionResponseData> {
    if (!interaction.guild_id) {
      return { content: "This command needs to be ran inside a Discord Server."};
    }
    if (!interaction.member?.user?.id) {
      return { content: `This command needs to be called by a user with an id.`};
    }

    try {
      // Delete the item into DynamoDB
      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          guildId: interaction.guild_id,
          userId: interaction.member.user.id,
        },
      }));

      return { content: `Successfully unsubscribed to notifications for this guild.` };
    } catch (error) {
      return { content: 'An error occurred while processing your request.' };
    }
  }
}

export class UnsubscribeAll extends CommandChatInputAsync {
  constructor() {
    super({
      name: "unsubscribe-all",
      description: "Unsubscribe for notifications for all guilds.",
      options: [],
    });
  }

  async handleInteractionAsync(interaction: DiscordInteractionApplicationCommand): Promise<DiscordInteractionResponseData> {
    if (!interaction.member?.user?.id) {
      return { content: `This command needs to be called by a user with an id.`};
    }

    try {
      const queryResults = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'UserIdIndex', // Replace with your index name if applicable
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': interaction.member.user.id,
        },
      }));

      // Delete each item found in the query
      const deletePromises = queryResults.Items?.map(item =>
        docClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            guildId: interaction.guild_id,
            userId: item.userId,
          },
        }))
      ) || [];

      await Promise.all(deletePromises);

      return { content: `Successfully subscribed to all guilds notifications.` };
    }
    catch (error) {
      return { content: 'An error occurred while processing your request.' };
    }
  }
}