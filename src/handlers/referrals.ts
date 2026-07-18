import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getStore } from "../store.js";

const composer = new Composer<Ctx>();

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

composer.callbackQuery("referrals:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;
  await showReferrals(ctx, userId);
});

composer.command("referrals", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  await showReferrals(ctx, userId);
});

async function showReferrals(ctx: Ctx, userId: number) {
  const store = getStore();
  const user = await store.getUser(userId);
  if (!user) {
    const msg = "You haven't signed up yet. Tap /start to create your account.";
    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { reply_markup: backToMenu });
    } else {
      await ctx.reply(msg, { reply_markup: backToMenu });
    }
    return;
  }

  const miners = await store.getMinersForAffiliate(userId);
  const txns = await store.getUserTransactions(userId);
  const commissions = txns.filter((t) => t.type === "commission");
  const totalCommissions = commissions.reduce((sum, t) => sum + t.amount, 0);

  const lines = [
    `🔗 Your referral code: ${user.referral_code}`,
    ``,
    `Share this code with others. When they join as miners, you earn 10% of their mining earnings.`,
    ``,
    `Referred miners: ${miners.length}`,
    `Commission earned: $${totalCommissions.toFixed(2)}`,
  ];

  if (miners.length === 0) {
    lines.push(`\nNo referrals yet — share your code to start earning.`);
  }

  const kb = inlineKeyboard([
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(lines.join("\n"), { reply_markup: kb });
  } else {
    await ctx.reply(lines.join("\n"), { reply_markup: kb });
  }
}

composer.callbackQuery(/^referrals:copy:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Code ready to share!" });
});

export default composer;
