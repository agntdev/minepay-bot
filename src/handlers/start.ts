import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  mainMenuKeyboard,
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { getStore, generateReferralCode } from "../store.js";

registerMainMenuItem({ label: "💰 Balance", data: "balance:show", order: 10 });
registerMainMenuItem({ label: "💸 Withdraw", data: "withdraw:start", order: 20 });
registerMainMenuItem({ label: "📋 Dispute", data: "dispute:start", order: 30 });
registerMainMenuItem({ label: "🔗 Referrals", data: "referrals:show", order: 40 });

const WELCOME = "👋 Welcome! Tap a button below to get started.";

const composer = new Composer<Ctx>();

composer.command("start", async (ctx) => {
  ctx.session.step = "idle";
  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
});

composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "idle";
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

composer.callbackQuery("onboard:begin", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getStore();
  const existing = await store.getUser(ctx.from.id);
  if (existing) {
    await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
    return;
  }
  await ctx.editMessageText(
    "Welcome to Mining Rewards!\n\nChoose your role to get started:",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⛏️ Miner", "onboard:miner"), inlineButton("🤝 Affiliate", "onboard:affiliate")],
        [inlineButton("⚡ Both", "onboard:both")],
      ]),
    },
  );
  ctx.session.step = "onboard_role";
});

composer.callbackQuery(/^onboard:(miner|affiliate|both)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const choice = ctx.match[1] as "miner" | "affiliate" | "both";
  ctx.session.onboard_role = choice;
  ctx.session.step = "onboard_contact";
  const label = choice === "both" ? "Miner & Affiliate" : choice.charAt(0).toUpperCase() + choice.slice(1);
  await ctx.editMessageText(
    `Great — you chose ${label}.\n\nWhat's your email address? This is used for payout notifications.`,
  );
});

composer.callbackQuery(/^onboard:payout:(paypal|bank)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const method = ctx.match[1] as "paypal" | "bank";
  ctx.session.onboard_payout_method = method;
  ctx.session.step = "onboard_payout_dest";
  const label = method === "paypal" ? "PayPal email" : "bank account details";
  await ctx.editMessageText(
    `Enter your ${label}. This is where your earnings will be sent.`,
  );
});

composer.callbackQuery(/^onboard:skip-referral$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await finishOnboarding(ctx);
});

composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  if (!step) return next();

  if (step === "onboard_contact") {
    const text = ctx.message.text.trim();
    if (!text.includes("@")) {
      await ctx.reply("That doesn't look like an email. Check the spelling and try again.");
      return;
    }
    ctx.session.onboard_contact = text;
    ctx.session.step = "onboard_payout_method";
    await ctx.reply(
      "How would you like to receive payouts?",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("PayPal", "onboard:payout:paypal"), inlineButton("Bank transfer", "onboard:payout:bank")],
        ]),
      },
    );
    return;
  }

  if (step === "onboard_payout_dest") {
    const text = ctx.message.text.trim();
    if (text.length < 3) {
      await ctx.reply("That's too short. Enter a valid payout destination.");
      return;
    }
    ctx.session.onboard_payout_dest = text;
    const role = ctx.session.onboard_role;
    if (role === "affiliate" || role === "both") {
      ctx.session.step = "onboard_referral";
      const code = generateReferralCode(ctx.from.id);
      ctx.session.onboard_referral_code = code;
      await ctx.reply(
        `Your referral code is: ${code}\n\nShare this code with others. They'll join as miners under you, and you'll earn 10% of their mining earnings.`,
        {
          reply_markup: inlineKeyboard([
            [inlineButton("Continue", "onboard:skip-referral")],
          ]),
        },
      );
    } else {
      await finishOnboarding(ctx);
    }
    return;
  }

  if (step === "withdraw_amount") {
    const text = ctx.message.text.trim();
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply("Enter a valid amount greater than $0.00.");
      return;
    }
    ctx.session.withdraw_amount = amount;
    const store = getStore();
    const user = await store.getUser(ctx.from.id);
    if (!user || user.balance < amount) {
      await ctx.reply(
        `Your balance is $${(user?.balance ?? 0).toFixed(2)} — not enough for a $${amount.toFixed(2)} withdrawal. Tap 💰 to check your balance.`,
        { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
      );
      ctx.session.step = "idle";
      return;
    }
    ctx.session.step = "withdraw_confirm";
    await ctx.reply(
      `Withdraw $${amount.toFixed(2)} to ${user.payout_destination}?`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("✅ Confirm", "withdraw:confirm:yes"), inlineButton("❌ Cancel", "withdraw:confirm:no")],
        ]),
      },
    );
    return;
  }

  if (step === "dispute_details") {
    const text = ctx.message.text.trim();
    if (text.length < 5) {
      await ctx.reply("Please provide more detail about your issue (at least 5 characters).");
      return;
    }
    ctx.session.dispute_details = text;
    const store = getStore();
    const { generateId } = await import("../store.js");
    const disputeId = generateId("disp");
    await store.saveDispute({
      id: disputeId,
      user_id: ctx.from.id,
      details: text,
      status: "open",
      timestamp: Date.now(),
    });
    await store.addDisputeToUser(ctx.from.id, disputeId);
    const { notifyAdminDispute } = await import("../email.js");
    await notifyAdminDispute({ userId: ctx.from.id, disputeId, details: text });
    ctx.session.step = "idle";
    await ctx.reply(
      `Dispute recorded (${disputeId}). Our team will review it and get back to you.`,
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
    );
    return;
  }

  return next();
});

async function finishOnboarding(ctx: Ctx) {
  const store = getStore();
  const telegramId = ctx.from?.id;
  if (!telegramId) return;
  const referralCode = ctx.session.onboard_referral_code ?? generateReferralCode(telegramId);

  await store.saveUser({
    telegram_id: telegramId,
    role: ctx.session.onboard_role ?? "miner",
    contact_info: ctx.session.onboard_contact ?? "",
    payout_destination: ctx.session.onboard_payout_dest ?? "",
    payout_method: ctx.session.onboard_payout_method ?? "paypal",
    balance: 0,
    referral_code: referralCode,
    onboarded_at: Date.now(),
  });

  await store.registerAffiliateCode(referralCode, telegramId);

  ctx.session.step = "idle";
  ctx.session.onboard_role = undefined;
  ctx.session.onboard_contact = undefined;
  ctx.session.onboard_payout_method = undefined;
  ctx.session.onboard_payout_dest = undefined;
  ctx.session.onboard_referral_code = undefined;

  await ctx.reply(
    "You're all set! Your account is ready.\n\nTap a button below to get started.",
    { reply_markup: mainMenuKeyboard() },
  );
}

export default composer;
