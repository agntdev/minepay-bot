import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getStore, generateId, MINING_RATE_PER_MINUTE, AFFILIATE_SHARE_PERCENTAGE } from "../store.js";

// Mining session handler — processes mining data and credits balances.
// In production, this would be triggered by an external API call via a webhook.
// For the Telegram bot interface, admins can submit mining sessions directly.

const composer = new Composer<Ctx>();

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

export async function processMiningSession(opts: {
  userId: number;
  startTime: number;
  endTime: number;
}): Promise<{ credited: number; minutes: number }> {
  const store = getStore();
  const user = await store.getUser(opts.userId);
  if (!user) throw new Error("User not found");

  const minutes = Math.floor((opts.endTime - opts.startTime) / 60000);
  if (minutes <= 0) throw new Error("Session must be at least 1 minute");

  const earned = minutes * MINING_RATE_PER_MINUTE;

  const sessionId = generateId("mine");
  await store.saveSession({
    id: sessionId,
    user_id: opts.userId,
    start_time: opts.startTime,
    end_time: opts.endTime,
    minutes_counted: minutes,
    status: "credited",
    rate_per_minute: MINING_RATE_PER_MINUTE,
  });
  await store.addSessionToUser(opts.userId, sessionId);

  const txnId = generateId("txn");
  await store.saveTransaction({
    id: txnId,
    type: "earning",
    amount: earned,
    timestamp: Date.now(),
    related_user: opts.userId,
    description: `Mining: ${minutes} minutes`,
  });
  await store.addTxnToUser(opts.userId, txnId);

  user.balance += earned;
  await store.saveUser(user);

  const affiliateId = await store.getAffiliateForMiner(opts.userId);
  if (affiliateId) {
    const commission = earned * (AFFILIATE_SHARE_PERCENTAGE / 100);
    const affUser = await store.getUser(affiliateId);
    if (affUser) {
      affUser.balance += commission;
      await store.saveUser(affUser);

      const commTxnId = generateId("txn");
      await store.saveTransaction({
        id: commTxnId,
        type: "commission",
        amount: commission,
        timestamp: Date.now(),
        related_user: affiliateId,
        description: `Commission from miner ${opts.userId}`,
      });
      await store.addTxnToUser(affiliateId, commTxnId);
    }
  }

  return { credited: earned, minutes };
}

composer.callbackQuery(/^mine:credit:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = Number(ctx.match[1]);
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  try {
    const result = await processMiningSession({ userId, startTime: oneHourAgo, endTime: now });
    await ctx.editMessageText(
      `✅ Credited ${result.minutes} minutes ($${result.credited.toFixed(2)}) to user ${userId}.`,
      { reply_markup: backToMenu },
    );
  } catch (err) {
    await ctx.editMessageText(
      `Failed to process mining session: ${(err as Error).message}`,
      { reply_markup: backToMenu },
    );
  }
});

export default composer;
