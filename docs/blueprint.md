# Mining Rewards Bot — Bot specification

**Archetype:** commerce

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

Telegram bot managing a paid mining program with miner earnings tracking, affiliate commissions, instant withdrawals to PayPal/bank, and admin email notifications for payouts and disputes. Handles user onboarding, referral tracking, balance management, and dispute resolution.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- miners
- affiliates
- admin

## Success criteria

- Miners can onboard and track earnings per active mining minutes
- Affiliates earn 10% of referred miners' earnings automatically
- Users can request instant withdrawals to PayPal/bank
- Admin receives email notifications for all payouts and disputes

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Initiate onboarding flow for miners/affiliates
- **/balance** (command, actor: user, command: /balance) — Display current earnings balance and referral stats
- **/withdraw** (command, actor: user, command: /withdraw) — Initiate withdrawal request to configured PayPal/bank
- **/dispute** (command, actor: user, command: /dispute) — Submit a dispute with optional attachments
- **/referrals** (command, actor: user, command: /referrals) — View referral earnings and share code

## Flows

### onboarding
_Trigger:_ /start

1. Select user role (miner/affiliate/both)
2. Verify contact info (phone/email)
3. Configure payout destination (PayPal/bank)
4. Generate referral code (for affiliates)

_Data touched:_ user account, affiliate relationship

### mining_reporting
_Trigger:_ external agent API call

1. Receive mining session data (start/end timestamps)
2. Calculate earned minutes at flat rate
3. Credit miner balance and notify user

_Data touched:_ miner session, transaction

### affiliate_commissions
_Trigger:_ miner balance update

1. Calculate 10% affiliate share of miner earnings
2. Credit affiliate balance
3. Log affiliate transaction

_Data touched:_ affiliate relationship, transaction

### withdrawal_processing
_Trigger:_ /withdraw

1. Validate payout destination
2. Generate withdrawal request
3. Email admin notification with payout details
4. Mark withdrawal as processed instantly

_Data touched:_ withdrawal request, transaction

### dispute_resolution
_Trigger:_ /dispute

1. Collect dispute details and attachments
2. Generate dispute record
3. Email admin notification
4. Track resolution status

_Data touched:_ dispute, transaction

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **user account** _(retention: persistent)_ — Telegram user with role, contact info, payout destination, and balance
  - fields: telegram_id, role, contact_info, payout_destination, balance
- **miner session** _(retention: persistent)_ — Record of active mining minutes and earnings
  - fields: user_id, start_time, end_time, minutes_counted, status
- **affiliate relationship** _(retention: persistent)_ — Link between affiliate and referred miner
  - fields: affiliate_id, miner_id, share_percentage, accrued_balance
- **transaction** _(retention: persistent)_ — Earnings, commissions, withdrawals, and dispute records
  - fields: type, amount, timestamp, related_entities
- **withdrawal request** _(retention: persistent)_ — User-initiated payout instruction
  - fields: user_id, destination, amount, status, timestamp
- **dispute** _(retention: persistent)_ — User-submitted dispute with resolution tracking
  - fields: user_id, details, attachments, status, timestamp

## Integrations

- **Telegram** (required) — User interface for commands, buttons, and notifications
- **Email** (required) — Admin notifications for withdrawals, disputes, and reports
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Configure affiliate share percentage (default 10%)
- Set fiat currency (default USD)
- Adjust flat mining rate per minute
- Review and resolve disputes

## Notifications

- Email to admin for every withdrawal request
- Email to admin for new disputes
- Periodic admin reports on earnings and activity

## Permissions & privacy

- No KYC required for account creation or payouts
- User-provided payout destinations stored securely
- Referral data anonymized in reports

## Edge cases

- Invalid withdrawal requests (negative amounts)
- Disputes submitted without details
- Referral loops (user referring themselves)

## Required tests

- End-to-end miner onboarding → mining → withdrawal flow
- Affiliate earns 10% of referred miner's earnings
- Admin receives email for all withdrawal/dispute events

## Assumptions

- Flat mining rate set to $0.01/minute (default)
- Affiliate share percentage is fixed at 10% unless changed
- Payout execution handled externally by owner
