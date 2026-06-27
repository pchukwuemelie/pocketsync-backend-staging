import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Transaction from '../models/Transaction';
import LinkedAccount from '../models/LinkedAccount';
import { SUPPORTED_BILL_PROVIDERS, TRANSACTION_CATEGORIES } from '../constants/transactions';
import {
  creditAccountAtomic,
  debitAccountAtomic,
  formatAccountSnapshot,
  formatTransaction,
  generateReference,
  koboToNgn,
  maskAccountNumber,
  ngnToKobo,
  parseAmountNgn,
  parseRecipientBank,
  parseRecipientName,
} from '../utils/transactionUtils';

const respondDebitError = (
  res: Response,
  reason: 'NOT_FOUND' | 'INSUFFICIENT_FUNDS',
  context: 'transfer' | 'interbank' | 'bill',
): void => {
  if (reason === 'NOT_FOUND') {
    const message =
      context === 'transfer'
        ? 'Forbidden — one or both accounts not found or not yours'
        : 'Forbidden — account not found or not yours';
    res.status(403).json({ error: message });
    return;
  }

  const message =
    context === 'bill'
      ? 'Insufficient balance for this bill payment'
      : 'Insufficient balance for this transfer';
  res.status(400).json({ error: message });
};

const respondMovementError = (res: Response, err: unknown, fallback: string): void => {
  console.error(`[${fallback}]`, err);
  res.status(500).json({
    error: fallback,
    details: process.env.NODE_ENV === 'development' && err instanceof Error ? err.message : undefined,
  });
};

// GET /api/v1/transactions
export const getTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const {
      accountId,
      category,
      type,
      fromDate,
      toDate,
      page = '1',
      limit = '30',
    } = req.query;

    // Base filter — ALWAYS scoped to authenticated user
    const filter: Record<string, unknown> = { userId };

    // If accountId provided, verify it belongs to this user before filtering
    if (accountId && typeof accountId === 'string') {
      const account = await LinkedAccount.findOne({
        _id: accountId as string,
        userId, // Ownership check — IDOR prevention
        isActive: true,
      });

      if (!account) {
        res.status(403).json({ error: 'Forbidden — account not found or not yours' });
        return;
      }

      filter.accountId = accountId as string;
    }

    if (category) filter.category = category;
    if (type) filter.type = type;

    if (fromDate || toDate) {
      filter.date = {};
      if (fromDate) (filter.date as Record<string, unknown>).$gte = new Date(fromDate as string);
      if (toDate) (filter.date as Record<string, unknown>).$lte = new Date(toDate as string);
    }

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(30, parseInt(limit as string)); // Hard cap at 30 
    const skip = (pageNum - 1) * limitNum;

    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ date: -1 }).skip(skip).limit(limitNum),
      Transaction.countDocuments(filter),
    ]);

    res.status(200).json({
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      transactions: transactions.map((t) => ({
        id: t._id,
        date: t.date,
        description: t.description,
        amount: koboToNgn(t.amount),
        type: t.type,
        category: t.category,
        institution: t.institution,
        accountId: t.accountId,
        reference: t.reference,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

// GET /api/v1/transactions/:transactionId
export const getTransactionById = async (req: Request, res: Response): Promise<void> => {
  try {
    const transaction = await Transaction.findById(req.params.transactionId);

    if (!transaction) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }

    // Ownership check — IDOR prevention
    if (transaction.userId.toString() !== req.user!.userId) {
      res.status(403).json({ error: 'Forbidden' }); // 403 not 404 — avoids ID enumeration
      return;
    }

    res.status(200).json({
      id: transaction._id,
      date: transaction.date,
      description: transaction.description,
      amount: koboToNgn(transaction.amount),
      type: transaction.type,
      category: transaction.category,
      institution: transaction.institution,
      reference: transaction.reference,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
};

// POST /api/v1/transactions/transfer
export const transferMoney = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { fromAccountId, toAccountId, amount, description } = req.body;

    if (!fromAccountId || !toAccountId) {
      res.status(400).json({ error: 'fromAccountId and toAccountId are required' });
      return;
    }

    if (fromAccountId === toAccountId) {
      res.status(400).json({ error: 'Cannot transfer to the same account' });
      return;
    }

    if (
      !mongoose.Types.ObjectId.isValid(fromAccountId) ||
      !mongoose.Types.ObjectId.isValid(toAccountId)
    ) {
      res.status(400).json({ error: 'Invalid account ID format' });
      return;
    }

    const amountNgn = parseAmountNgn(amount);
    if (amountNgn === null) {
      res.status(400).json({ error: 'amount must be a number of at least ₦1.00' });
      return;
    }

    const amountKobo = ngnToKobo(amountNgn);
    const reference = generateReference();
    const now = new Date();

    const debitResult = await debitAccountAtomic(userId, fromAccountId, amountKobo);
    if (!debitResult.ok) {
      respondDebitError(res, debitResult.reason, 'transfer');
      return;
    }

    const creditedAccount = await creditAccountAtomic(userId, toAccountId, amountKobo);
    if (!creditedAccount) {
      await creditAccountAtomic(userId, fromAccountId, amountKobo);
      res.status(403).json({ error: 'Forbidden — one or both accounts not found or not yours' });
      return;
    }

    const source = debitResult.account;
    const destination = creditedAccount;

    const debitDescription =
      typeof description === 'string' && description.trim()
        ? description.trim()
        : `Transfer to ${destination.institution}`;

    const creditDescription =
      typeof description === 'string' && description.trim()
        ? `Transfer from ${source.institution} — ${description.trim()}`
        : `Transfer from ${source.institution}`;

    const [debitTransaction, creditTransaction] = await Transaction.create([
      {
        userId,
        accountId: source._id,
        institution: source.institution,
        date: now,
        description: debitDescription,
        amount: -amountKobo,
        type: 'debit',
        category: 'Transfer',
        reference,
      },
      {
        userId,
        accountId: destination._id,
        institution: destination.institution,
        date: now,
        description: creditDescription,
        amount: amountKobo,
        type: 'credit',
        category: 'Transfer',
        reference,
      },
    ]);

    res.status(201).json({
      message: 'Transfer successful',
      transfer: {
        reference,
        amount: amountNgn,
        fromAccount: formatAccountSnapshot(source),
        toAccount: formatAccountSnapshot(destination),
        debitTransaction: formatTransaction(debitTransaction),
        creditTransaction: formatTransaction(creditTransaction),
      },
    });
  } catch (err: unknown) {
    respondMovementError(res, err, 'Transfer failed');
  }
};

// POST /api/v1/transactions/interbank-transfer
// Mock NIP transfer to an external bank account (not one of the user's linked accounts)
export const interbankTransfer = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const {
      fromAccountId,
      recipientBank,
      recipientAccountNumber,
      recipientName,
      amount,
      description,
    } = req.body;

    if (!fromAccountId) {
      res.status(400).json({ error: 'fromAccountId is required' });
      return;
    }

    const recipientBankName = parseRecipientBank(recipientBank);
    if (!recipientBankName) {
      res.status(400).json({
        error: 'recipientBank is required and must be a valid bank name (2–100 characters)',
      });
      return;
    }

    if (
      typeof recipientAccountNumber !== 'string' ||
      !/^\d{10}$/.test(recipientAccountNumber)
    ) {
      res.status(400).json({ error: 'recipientAccountNumber must be a 10-digit account number' });
      return;
    }

    const amountNgn = parseAmountNgn(amount);
    if (amountNgn === null) {
      res.status(400).json({ error: 'amount must be a number of at least ₦1.00' });
      return;
    }

    const amountKobo = ngnToKobo(amountNgn);
    const reference = generateReference();
    const nipReference = `NIP${Date.now()}`;
    const maskedRecipient = maskAccountNumber(recipientAccountNumber);
    const now = new Date();

    const recipientLabel = parseRecipientName(recipientName);

    if (!mongoose.Types.ObjectId.isValid(fromAccountId)) {
      res.status(400).json({ error: 'Invalid account ID format' });
      return;
    }

    const debitResult = await debitAccountAtomic(userId, fromAccountId, amountKobo);
    if (!debitResult.ok) {
      respondDebitError(res, debitResult.reason, 'interbank');
      return;
    }

    const source = debitResult.account;

    const transferDescription =
      typeof description === 'string' && description.trim()
        ? description.trim()
        : `Interbank transfer to ${recipientLabel} — ${recipientBankName} ${maskedRecipient}`;

    const transaction = await Transaction.create({
      userId,
      accountId: source._id,
      institution: source.institution,
      date: now,
      description: transferDescription,
      amount: -amountKobo,
      type: 'debit',
      category: 'Transfer',
      reference: nipReference,
    });

    res.status(201).json({
      message: 'Interbank transfer successful',
      transfer: {
        reference,
        nipReference,
        amount: amountNgn,
        status: 'completed',
        fromAccount: formatAccountSnapshot(source),
        recipient: {
          bank: recipientBankName,
          accountNumber: maskedRecipient,
          name: recipientLabel,
        },
        transaction: formatTransaction(transaction),
      },
    });
  } catch (err: unknown) {
    respondMovementError(res, err, 'Interbank transfer failed');
  }
};

// POST /api/v1/transactions/pay-bill
export const payBill = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { fromAccountId, amount, billProvider, customerReference, description } = req.body;

    if (!fromAccountId) {
      res.status(400).json({ error: 'fromAccountId is required' });
      return;
    }

    if (
      !billProvider ||
      !(SUPPORTED_BILL_PROVIDERS as readonly string[]).includes(billProvider)
    ) {
      res.status(400).json({
        error: `Unsupported bill provider. Supported: ${SUPPORTED_BILL_PROVIDERS.join(', ')}`,
      });
      return;
    }

    const amountNgn = parseAmountNgn(amount);
    if (amountNgn === null) {
      res.status(400).json({ error: 'amount must be a number of at least ₦1.00' });
      return;
    }

    const amountKobo = ngnToKobo(amountNgn);
    const reference = generateReference();
    const now = new Date();

    if (!mongoose.Types.ObjectId.isValid(fromAccountId)) {
      res.status(400).json({ error: 'Invalid account ID format' });
      return;
    }

    const debitResult = await debitAccountAtomic(userId, fromAccountId, amountKobo);
    if (!debitResult.ok) {
      respondDebitError(res, debitResult.reason, 'bill');
      return;
    }

    const source = debitResult.account;

    const billDescription =
      typeof description === 'string' && description.trim()
        ? description.trim()
        : `Bill payment — ${billProvider}`;

    const transaction = await Transaction.create({
      userId,
      accountId: source._id,
      institution: source.institution,
      date: now,
      description: billDescription,
      amount: -amountKobo,
      type: 'debit',
      category: 'Bills',
      reference:
        typeof customerReference === 'string' && customerReference.trim()
          ? customerReference.trim()
          : reference,
    });

    res.status(201).json({
      message: 'Bill payment successful',
      payment: {
        reference,
        amount: amountNgn,
        billProvider,
        account: formatAccountSnapshot(source),
        transaction: formatTransaction(transaction),
      },
    });
  } catch (err: unknown) {
    respondMovementError(res, err, 'Bill payment failed');
  }
};

// PATCH /api/v1/transactions/:transactionId/category
export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category } = req.body;

    // Validate category against enum — never accept arbitrary strings
    if (!category || !(TRANSACTION_CATEGORIES as readonly string[]).includes(category)) {
      res.status(400).json({
        error: `Invalid category. Valid: ${TRANSACTION_CATEGORIES.join(', ')}`,
      });
      return;
    }

    const transaction = await Transaction.findById(req.params.transactionId);

    if (!transaction) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }

    // Ownership check
    if (transaction.userId.toString() !== req.user!.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    transaction.category = category;
    await transaction.save();

    res.status(200).json({ message: 'Category updated', category: transaction.category });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update category' });
  }
};
