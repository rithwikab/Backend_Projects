/*
  Reconcile expected payments with actual transactions

  Input:
    expectedPayments: Array<ExpectedPayment>
    actualTransactions: Array<ActualTransaction>

  Output:
    Array<ReconciliationResult>
*/

function reconcilePayments(expectedPayments, actualTransactions) {

  // Clone arrays so original data is not mutated
  const expected = [...expectedPayments];
  const actual = [...actualTransactions];

  // Track used transactions (to prevent double matching)
  const usedTransactions = new Set();

  // Sort for deterministic processing
  expected.sort(
    (a, b) => new Date(a.due_date) - new Date(b.due_date)
  );

  actual.sort(
    (a, b) => new Date(a.transaction_date) - new Date(b.transaction_date)
  );

  const results = [];

  /* ---------------------------------------------------
     Main Loop: Process each expected payment
  --------------------------------------------------- */

  for (const exp of expected) {

    let remainingAmount = Number(exp.amount);

    const matchedTransactions = [];

    /* -----------------------------------------------
       Rule 1: Exact Reference + Exact Amount
    ----------------------------------------------- */

    let match = actual.find(tx =>
      !usedTransactions.has(tx._id || tx._id || tx.id) &&
      tx.reference_no === exp.source_ref &&
      tx.currency === exp.currency &&
      Number(tx.amount) === remainingAmount
    );

    if (match) {

      usedTransactions.add(match.id);

      results.push(buildResult(
        exp,
        [match],
        "PERFECT_MATCH",
        0
      ));

      continue;
    }

    /* -----------------------------------------------
       Rule 2: Reference + Partial Payment
    ----------------------------------------------- */

    const partialsByRef = actual.filter(tx =>
      !usedTransactions.has(tx._id || tx.id) &&
      tx.reference_no === exp.source_ref &&
      tx.currency === exp.currency
    );

    for (const tx of partialsByRef) {

      if (remainingAmount <= 0) break;

      if (tx.amount <= remainingAmount) {

        remainingAmount -= tx.amount;

        usedTransactions.add(tx._id || tx.id);
        matchedTransactions.push(tx);
      }
    }

    if (matchedTransactions.length > 0) {

      const variance = remainingAmount * -1;

      const status =
        remainingAmount === 0
          ? "AGGREGATED_MATCH"
          : "PARTIAL_MATCH";

      results.push(buildResult(
        exp,
        matchedTransactions,
        status,
        variance
      ));

      continue;
    }

    /* -----------------------------------------------
       Rule 3: Amount + Customer + Date Window (±7 days)
    ----------------------------------------------- */

    const dueDate = new Date(exp.due_date);

    match = actual.find(tx => {

      if (usedTransactions.has(tx._id || tx.id)) return false;
      if (tx.currency !== exp.currency) return false;
      if (tx.customer_ref !== exp.customer_id) return false;
      if (Number(tx.amount) !== remainingAmount) return false;

      const txDate = new Date(tx.transaction_date);

      const diffDays =
        Math.abs(txDate - dueDate) / (1000 * 60 * 60 * 24);

      return diffDays <= 7;
    });

    if (match) {

      usedTransactions.add(match.id);

      results.push(buildResult(
        exp,
        [match],
        "AMOUNT_MATCH",
        0
      ));

      continue;
    }

    /* -----------------------------------------------
       Rule 4: Aggregate by Amount (No Reference)
    ----------------------------------------------- */

    const candidates = actual.filter(tx =>
      !usedTransactions.has(tx._id || tx.id) &&
      tx.currency === exp.currency &&
      tx.customer_ref === exp.customer_id
    );

    let tempAmount = remainingAmount;
    const tempMatches = [];

    for (const tx of candidates) {

      if (tempAmount <= 0) break;

      if (tx.amount <= tempAmount) {

        tempAmount -= tx.amount;
        tempMatches.push(tx);
      }
    }

    if (tempMatches.length > 0 && tempAmount === 0) {

      tempMatches.forEach(tx =>
        usedTransactions.add(tx._id || tx._id || tx.id)
      );

      results.push(buildResult(
        exp,
        tempMatches,
        "AGGREGATED_MATCH",
        0
      ));

      continue;
    }

    /* -----------------------------------------------
       Rule 5: Missing Payment
    ----------------------------------------------- */

    results.push(buildResult(
      exp,
      [],
      "MISSING",
      -remainingAmount
    ));
  }

  return results;
}

/* ---------------------------------------------------
   Helper: Build reconciliation result
--------------------------------------------------- */

function buildResult(
  expected,
  transactions,
  status,
  variance
) {

  return {

    // For DB updates
    expectedId: expected._id || expected.id,

    transactionIds: transactions.map(
      tx => tx._id || tx._id || tx._id || tx.id
    ),

    // For reporting
    status,

    expectedAmount: Number(expected.amount),

    matchedAmount: transactions.reduce(
      (sum, t) => sum + Number(t.amount),
      0
    ),

    variance,

    method: "AUTO"
  };
}


module.exports = {
  reconcilePayments
};
