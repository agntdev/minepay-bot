import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getStore } from "../store.js";

const composer = new Composer<Ctx>();

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

composer.callbackQuery("dispute:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;
  const store = getStore();
  const user = await store.getUser(userId);
  if (!user) {
    await ctx.editMessageText(
      "You haven't signed up yet. Tap /start to create your account.",
      { reply_markup: backToMenu },
    );
    return;
  }
  ctx.session.step = "dispute_details";
  await ctx.editMessageText(
    "Describe your issue. Include any relevant details — transaction ID, date, or amount.",
  );
});

composer.command("dispute", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  const store = getStore();
  const user = await store.getUser(userId);
  if (!user) {
    await ctx.reply(
      "You haven't signed up yet. Tap /start to create your account.",
      { reply_markup: backToMenu },
    );
    return;
  }
  ctx.session.step = "dispute_details";
  await ctx.reply(
    "Describe your issue. Include any relevant details — transaction ID, date, or amount.",
  );
});

export default composer;
