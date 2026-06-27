import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import User from "../models/User";
import Otp from "../models/Otp";
import PhoneOtp from "../models/PhoneOtp";
import DiscoveredAccount from "../models/DiscoveredAccount";
import LinkedAccount, { Institution } from "../models/LinkedAccount";
import Transaction, {
  TransactionCategory,
  TransactionType,
} from "../models/Transaction";

dotenv.config();

interface MockTransaction {
  description: string;
  amount: number; // in kobo
  type: TransactionType;
  category: TransactionCategory;
  daysAgo: number;
}

const gtbankTxns: MockTransaction[] = [
  {
    description: "Salary Credit - Interswitch",
    amount: 25000000,
    type: "credit",
    category: "Transfer",
    daysAgo: 1,
  },
  {
    description: "DSTV Subscription",
    amount: -2150000,
    type: "debit",
    category: "Bills",
    daysAgo: 2,
  },
  {
    description: "Chicken Republic Lekki",
    amount: -650000,
    type: "debit",
    category: "Food",
    daysAgo: 3,
  },
  {
    description: "Bolt Ride - Victoria Island",
    amount: -180000,
    type: "debit",
    category: "Transport",
    daysAgo: 4,
  },
  {
    description: "Transfer to Kuda - Chike",
    amount: -5000000,
    type: "debit",
    category: "Transfer",
    daysAgo: 5,
  },
  {
    description: "NEPA / IKEDC Electricity",
    amount: -1500000,
    type: "debit",
    category: "Bills",
    daysAgo: 7,
  },
  {
    description: "Shoprite Surulere",
    amount: -3200000,
    type: "debit",
    category: "Food",
    daysAgo: 9,
  },
  {
    description: "MTN Data Bundle",
    amount: -300000,
    type: "debit",
    category: "Bills",
    daysAgo: 11,
  },
  {
    description: "Freelance Payment - Flutterwave",
    amount: 8000000,
    type: "credit",
    category: "Transfer",
    daysAgo: 12,
  },
  {
    description: "Netflix Subscription",
    amount: -440000,
    type: "debit",
    category: "Entertainment",
    daysAgo: 14,
  },
  {
    description: "Dominos Pizza Ikeja",
    amount: -1200000,
    type: "debit",
    category: "Food",
    daysAgo: 16,
  },
  {
    description: "Uber - Airport Trip",
    amount: -750000,
    type: "debit",
    category: "Transport",
    daysAgo: 18,
  },
];

const accessTxns: MockTransaction[] = [
  {
    description: "Transfer from GTBank",
    amount: 5000000,
    type: "credit",
    category: "Transfer",
    daysAgo: 5,
  },
  {
    description: "Cowrywise Savings",
    amount: -2000000,
    type: "debit",
    category: "Savings",
    daysAgo: 6,
  },
  {
    description: "Total Filling Station",
    amount: -1800000,
    type: "debit",
    category: "Transport",
    daysAgo: 8,
  },
  {
    description: "House Rent - Landlord",
    amount: -45000000,
    type: "debit",
    category: "Bills",
    daysAgo: 10,
  },
  {
    description: "Airtime Recharge - Glo",
    amount: -100000,
    type: "debit",
    category: "Bills",
    daysAgo: 13,
  },
  {
    description: "Kilimanjaro Restaurant",
    amount: -850000,
    type: "debit",
    category: "Food",
    daysAgo: 15,
  },
  {
    description: "Refund - Jumia Order",
    amount: 1200000,
    type: "credit",
    category: "Transfer",
    daysAgo: 17,
  },
  {
    description: "Genesis Cinema Ticket",
    amount: -350000,
    type: "debit",
    category: "Entertainment",
    daysAgo: 19,
  },
  {
    description: "Bolt Ride - Lekki Phase 1",
    amount: -220000,
    type: "debit",
    category: "Transport",
    daysAgo: 20,
  },
  {
    description: "Shoprite Grocery",
    amount: -4500000,
    type: "debit",
    category: "Food",
    daysAgo: 22,
  },
  {
    description: "DSTV Premium",
    amount: -2150000,
    type: "debit",
    category: "Bills",
    daysAgo: 25,
  },
  {
    description: "Salary Advance",
    amount: 10000000,
    type: "credit",
    category: "Transfer",
    daysAgo: 28,
  },
];

const kudaTxns: MockTransaction[] = [
  {
    description: "Transfer from GTBank",
    amount: 5000000,
    type: "credit",
    category: "Transfer",
    daysAgo: 5,
  },
  {
    description: "Kuda Savings Interest",
    amount: 125000,
    type: "credit",
    category: "Savings",
    daysAgo: 6,
  },
  {
    description: "Mr Biggs Victoria Island",
    amount: -450000,
    type: "debit",
    category: "Food",
    daysAgo: 7,
  },
  {
    description: "Spotify Premium",
    amount: -299000,
    type: "debit",
    category: "Entertainment",
    daysAgo: 10,
  },
  {
    description: "Uber Eats Order",
    amount: -1850000,
    type: "debit",
    category: "Food",
    daysAgo: 12,
  },
  {
    description: "Bolt Ride - Maryland",
    amount: -150000,
    type: "debit",
    category: "Transport",
    daysAgo: 14,
  },
  {
    description: "Airtime - MTN",
    amount: -200000,
    type: "debit",
    category: "Bills",
    daysAgo: 16,
  },
  {
    description: "PiggyVest Savings",
    amount: -3000000,
    type: "debit",
    category: "Savings",
    daysAgo: 18,
  },
  {
    description: "Side Hustle Payment",
    amount: 2500000,
    type: "credit",
    category: "Transfer",
    daysAgo: 20,
  },
  {
    description: "Cold Stone Creamery",
    amount: -380000,
    type: "debit",
    category: "Food",
    daysAgo: 23,
  },
  {
    description: "GOTV Subscription",
    amount: -490000,
    type: "debit",
    category: "Bills",
    daysAgo: 26,
  },
  {
    description: "Transfer to Access Bank",
    amount: -1000000,
    type: "debit",
    category: "Transfer",
    daysAgo: 29,
  },
];

const opayTxns: MockTransaction[] = [
  {
    description: "Opay Cashback Reward",
    amount: 50000,
    type: "credit",
    category: "Transfer",
    daysAgo: 2,
  },
  {
    description: "Chicken Republic Ajah",
    amount: -520000,
    type: "debit",
    category: "Food",
    daysAgo: 4,
  },
  {
    description: "BRT Bus Ticket",
    amount: -10000,
    type: "debit",
    category: "Transport",
    daysAgo: 6,
  },
  {
    description: "Airtime Recharge - Airtel",
    amount: -100000,
    type: "debit",
    category: "Bills",
    daysAgo: 8,
  },
  {
    description: "Received from Friend - Tunde",
    amount: 2000000,
    type: "credit",
    category: "Transfer",
    daysAgo: 10,
  },
  {
    description: "Tantalizers Ikotun",
    amount: -320000,
    type: "debit",
    category: "Food",
    daysAgo: 12,
  },
  {
    description: "Danfo Fare Payment",
    amount: -5000,
    type: "debit",
    category: "Transport",
    daysAgo: 14,
  },
  {
    description: "Pay Bill - LAWMA",
    amount: -250000,
    type: "debit",
    category: "Bills",
    daysAgo: 17,
  },
  {
    description: "Supermarket - Spar",
    amount: -1650000,
    type: "debit",
    category: "Food",
    daysAgo: 20,
  },
  {
    description: "Data Bundle - 9mobile",
    amount: -149000,
    type: "debit",
    category: "Bills",
    daysAgo: 24,
  },
  {
    description: "Bolt - Isale Eko",
    amount: -180000,
    type: "debit",
    category: "Transport",
    daysAgo: 27,
  },
  {
    description: "Opay Interest Credit",
    amount: 30000,
    type: "credit",
    category: "Savings",
    daysAgo: 29,
  },
];

const moniepointTxns: MockTransaction[] = [
  {
    description: "Business Revenue - Client A",
    amount: 150000000,
    type: "credit",
    category: "Transfer",
    daysAgo: 1,
  },
  {
    description: "Business Revenue - Client B",
    amount: 80000000,
    type: "credit",
    category: "Transfer",
    daysAgo: 3,
  },
  {
    description: "Office Rent - Lekki Phase 1",
    amount: -120000000,
    type: "debit",
    category: "Bills",
    daysAgo: 5,
  },
  {
    description: "Team Salaries - August",
    amount: -85000000,
    type: "debit",
    category: "Transfer",
    daysAgo: 7,
  },
  {
    description: "Generator Fuel",
    amount: -1500000,
    type: "debit",
    category: "Bills",
    daysAgo: 9,
  },
  {
    description: "Business Lunch - Terra Kulture",
    amount: -2500000,
    type: "debit",
    category: "Food",
    daysAgo: 11,
  },
  {
    description: "Software Subscription - AWS",
    amount: -3200000,
    type: "debit",
    category: "Bills",
    daysAgo: 13,
  },
  {
    description: "Transfer to GTBank Ops",
    amount: -20000000,
    type: "debit",
    category: "Transfer",
    daysAgo: 15,
  },
  {
    description: "Client Retainer - Q3",
    amount: 200000000,
    type: "credit",
    category: "Transfer",
    daysAgo: 17,
  },
  {
    description: "Business Event Ticket",
    amount: -1500000,
    type: "debit",
    category: "Entertainment",
    daysAgo: 19,
  },
  {
    description: "Courier - DHL Nigeria",
    amount: -350000,
    type: "debit",
    category: "Transport",
    daysAgo: 21,
  },
  {
    description: "Office Supplies - Marketplace",
    amount: -800000,
    type: "debit",
    category: "Other",
    daysAgo: 24,
  },
];

const seedDatabase = async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  console.log("🌱 Connected to MongoDB for seeding...");

  // Clear existing data
  await User.deleteMany({});
  await Otp.deleteMany({});
  await PhoneOtp.deleteMany({});
  await DiscoveredAccount.deleteMany({});
  await LinkedAccount.deleteMany({});
  await Transaction.deleteMany({});
  console.log("🗑️  Cleared existing data");

  // Create demo user — bypass pre-save hook by inserting hash directly
  const passwordHash = await bcrypt.hash("Demo@1234", 12);
  const user = await User.collection.insertOne({
    email: "demo@pocketsync.ng",
    fullName: "Demo User",
    passwordHash,
    emailVerified: true,
    emailVerifiedAt: new Date(),
    termsAcceptedAt: new Date(),
    bvnVerified: true,
    bvnVerifiedAt: new Date(),
    phoneNumber: "+2348012345678",
    phoneVerified: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const userId = user.insertedId;
  console.log("Just Created demo user: demo@pocketsync.ng / Demo@1234");

  // Seed institution data
  const institutionData: Array<{
    institution: string;
    balance: number;
    txns: MockTransaction[];
    accountType: string;
    masked: string;
  }> = [
    {
      institution: "GTBank",
      balance: 24500000,
      txns: gtbankTxns,
      accountType: "current",
      masked: "****4471",
    },
    {
      institution: "Access Bank",
      balance: 87300000,
      txns: accessTxns,
      accountType: "savings",
      masked: "****2283",
    },
    {
      institution: "Kuda",
      balance: 12750000,
      txns: kudaTxns,
      accountType: "wallet",
      masked: "****9910",
    },
    {
      institution: "Opay",
      balance: 5600000,
      txns: opayTxns,
      accountType: "wallet",
      masked: "****6642",
    },
    {
      institution: "Moniepoint",
      balance: 340000000,
      txns: moniepointTxns,
      accountType: "business",
      masked: "****1155",
    },
  ];

  for (const inst of institutionData) {
    const account = await LinkedAccount.create({
      userId,
      institution: inst.institution as Institution,
      maskedAccountNumber: inst.masked,
      accessToken: `mock_token_${inst.institution.toLowerCase().replace(" ", "_")}_seed`,
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      balance: inst.balance,
      accountType: inst.accountType,
    });

    // Create transactions for this account
    const txDocs = inst.txns.map((tx) => {
      const date = new Date();
      date.setDate(date.getDate() - tx.daysAgo);
      return {
        userId,
        accountId: account._id,
        institution: inst.institution,
        date,
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        category: tx.category,
        reference: `REF${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      };
    });

    await Transaction.insertMany(txDocs);
    console.log(
      `Just Seeded ${inst.institution}: ${inst.txns.length} transactions`,
    );
  }

  const totalTxns = await Transaction.countDocuments();
  console.log(`\n   The Seed is complete!`);
  console.log(`   Users: 1`);
  console.log(`   Accounts: ${institutionData.length}`);
  console.log(`   Transactions: ${totalTxns}`);
  console.log(`\n   Login: demo@pocketsync.ng / Demo@1234`);

  await mongoose.disconnect();
};

seedDatabase().catch((err) => {
  console.error("The Seed failed:", err);
  process.exit(1);
});
