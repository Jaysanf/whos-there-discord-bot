import { DiscordInteractionApplicationCommand } from "serverless-discord/discord/interactions";
import { Subscribe } from "./commands";

describe("SubscribeCommand", () => {
  it("should return a response", async () => {
    const command = new Subscribe();
    const res = await command.handleInteraction(new DiscordInteractionApplicationCommand({
      id: "123",
      application_id: "123",
      token: "123",
      version: 1,
      data: {
        type: 1,
        id: "123",
        name: "test",
        options: [],
      },
    }));
    expect(res).toEqual({
      type: 4,
      data: {
        content: "Hello World!",
      },
    });
  });
});