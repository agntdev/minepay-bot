import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getStore, generateId } from "../store.js";
import { notifyAdminWithdrawal } from "../email.js";

const composer = new Composer<Ctx>();

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

composer.callbackQuery("withdraw:start", async (ctx) => {
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
  if (user.balance <= 0) {
    await ctx.editMessageText(
      `Your balance is $0.00 — nothing to withdraw yet. Keep mining to earn more.`,
      { reply_markup: backToMenu },
    );
    return;
  }
  ctx.session.step = "withdraw_amount";
  await ctx.editMessageText(
    `Your balance: $${user.balance.toFixed(2)}\n\nHow much would you like to withdraw? Enter an amount in USD.`,
  );
});

composer.command("withdraw", async (ctx) => {
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
  if (user.balance <= 0) {
    await ctx.reply(
      `Your balance is $0.00 — nothing to withdraw yet. Keep mining to earn more.`,
      { reply_markup: backToMenu },
    );
    return;
  }
  ctx.session.step = "withdraw_amount";
  await ctx.reply(
    `Your balance: $${user.balance.toFixed(2)}\n\nHow much would you like to withdraw? Enter an amount in USD.`,
  );
});

composer.callbackQuery(/^withdraw:confirm:(yes|no)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const choice = ctx.match[1];
  const userId = ctx.from?.id;
  if (!userId) return;

  if (choice === "no") {
    ctx.session.step = "idle";
    ctx.session.withdraw_amount = undefined;
    await ctx.editMessageText("Withdrawal cancelled.", { reply_markup: backToMenu });
    return;
  }

  const store = getStore();
  const user = await store.getUser(userId);
  const amount = ctx.session.withdraw_amount;

  if (!user || !amount || amount <= 0) {
    ctx.session.step = "idle";
    await ctx.editMessageText(
      "Something went wrong. Tap /start to try again.",
      { reply_markup: backToMenu },
    );
    return;
  }

  if (user.balance < amount) {
    ctx.session.step = "idle";
    await ctx.editMessageText(
      `Your balance dropped to $${user.balance.toFixed(2)} — not enough for this withdrawal.`,
      { reply_markup: backToMenu },
    );
    return;
  }

  user.balance -= amount;
  await store.saveUser(user);

  const withdrawalId = generateId("wd");
  await store.saveWithdrawal({
    id: withdrawalId,
    user_id: userId,
    destination: user.payout_destination,
    amount,
    status: "processed",
    timestamp: Date.now(),
  });
  await store.addWithdrawalToUser(userId, withdrawalId);

  const txnId = generateId("txn");
  await store.saveTransaction({
    id: txnId,
    type: "withdrawal",
    amount,
    timestamp: Date.now(),
    related_user: userId,
    description: `Withdrawal to ${user.payout_destination}`,
  });
  await store.addTxnToUser(userId, txnId);

  await notifyAdminWithdrawal({
    userId,
    amount,
    destination: user.payout_destination,
    method: user.payout_method,
  });

  ctx.session.step = "idle";
  ctx.session.withdraw_amount = undefined;

  await ctx.editMessageText(
    `✅ $${amount.toFixed(2)} has been sent to ${user.payout_destination}.\n\nNew balance: $${user.balance.toFixed(2)}`,
    { reply_markup: backToMenu },
  );
});

export default composer;
