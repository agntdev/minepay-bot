import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getStore } from "../store.js";

const composer = new Composer<Ctx>();

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

composer.callbackQuery("balance:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;
  const store = getStore();
  const user = await store.getUser(userId);
  if (!user) {
    await ctx.editMessageText(
      "You haven't signed up yet. Tap /start to create your account.",
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
    );
    return;
  }

  const sessions = await store.getUserSessions(userId);
  const totalMinutes = sessions
    .filter((s) => s.status === "credited" || s.status === "completed")
    .reduce((sum, s) => sum + s.minutes_counted, 0);

  const txns = await store.getUserTransactions(userId);
  const totalEarnings = txns
    .filter((t) => t.type === "earning")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalCommissions = txns
    .filter((t) => t.type === "commission")
    .reduce((sum, t) => sum + t.amount, 0);

  const miners = await store.getMinersForAffiliate(userId);

  const lines = [
    `💰 Balance: $${user.balance.toFixed(2)}`,
    ``,
    `Total mined: ${totalMinutes} minutes ($${totalEarnings.toFixed(2)})`,
    `Commission earned: $${totalCommissions.toFixed(2)}`,
  ];

  if (user.role === "affiliate" || user.role === "both") {
    lines.push(`Referred miners: ${miners.length}`);
  }

  await ctx.editMessageText(lines.join("\n"), { reply_markup: backToMenu });
});

composer.command("balance", async (ctx) => {
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

  const sessions = await store.getUserSessions(userId);
  const totalMinutes = sessions
    .filter((s) => s.status === "credited" || s.status === "completed")
    .reduce((sum, s) => sum + s.minutes_counted, 0);

  const txns = await store.getUserTransactions(userId);
  const totalEarnings = txns
    .filter((t) => t.type === "earning")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalCommissions = txns
    .filter((t) => t.type === "commission")
    .reduce((sum, t) => sum + t.amount, 0);

  const miners = await store.getMinersForAffiliate(userId);

  const lines = [
    `💰 Balance: $${user.balance.toFixed(2)}`,
    ``,
    `Total mined: ${totalMinutes} minutes ($${totalEarnings.toFixed(2)})`,
    `Commission earned: $${totalCommissions.toFixed(2)}`,
  ];

  if (user.role === "affiliate" || user.role === "both") {
    lines.push(`Referred miners: ${miners.length}`);
  }

  await ctx.reply(lines.join("\n"), { reply_markup: backToMenu });
});

export default composer;
