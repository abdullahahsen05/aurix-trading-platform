import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Platform Admin",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  const trader = await prisma.user.upsert({
    where: { email: "ayan@example.com" },
    update: {},
    create: {
      email: "ayan@example.com",
      name: "Ayan Malik",
      role: "TRADER",
      status: "ACTIVE",
      traderProfile: {
        create: {
          segment: "FUNDED",
        },
      },
    },
  });

  await prisma.tradingAccount.upsert({
    where: { id: "seed-account-orion" },
    update: {},
    create: {
      id: "seed-account-orion",
      userId: trader.id,
      accountName: "Orion Growth 100K",
      brokerName: "MetaTrader 5 Demo",
      status: "CONNECTED",
      snapshots: {
        create: {
          balance: 102480,
          equity: 103142,
          floatingPnl: 662,
          drawdownPercent: 3.7,
          capturedAt: new Date(),
        },
      },
      trades: {
        create: [
          {
            symbol: "XAUUSD",
            side: "BUY",
            status: "OPEN",
            volume: 0.8,
            openPrice: 2341.4,
            profit: 418,
            openedAt: new Date(),
          },
          {
            symbol: "EURUSD",
            side: "SELL",
            status: "CLOSED",
            volume: 1.2,
            openPrice: 1.0872,
            closePrice: 1.0832,
            profit: 320,
            openedAt: new Date(Date.now() - 86400000),
            closedAt: new Date(),
          },
        ],
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "seed.demo_data_created",
      entityType: "system",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
