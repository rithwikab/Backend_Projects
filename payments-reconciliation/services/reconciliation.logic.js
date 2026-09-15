/*
  Reconcile expected payments with actual transactions

  Input:
    expectedPayments: Array<ExpectedPayment>
    actualTransactions: Array<ActualTransaction>

  Output:
    Array<ReconciliationResult>

  CHANGES FROM THE ORIGINAL VERSION (both fixes, not feature adds):

  1. FIXED BUG: usedTransactions previously mixed two different JS
     values for the same transaction — tx._id (a Mongoose ObjectId
     OBJECT) in membership checks, vs tx.id / match.id (Mongoose's
     virtual STRING getter for the same value) when adding to the
     Set. A Set uses strict equality, and an ObjectId object is
     never === its own string form, so a transaction added via one
     code path could fail to be recognized as "already used" by a
     check elsewhere — allowing the same transaction to be matched
     to two different invoices. Fixed by computing ONE canonical
     string key per transaction, once, and using only that key for
     every .has()/.add() call in this function.

  2. NEW: every result now carries requiresReview. Rules 1 & 2 are
     reference-based (the payer explicitly quoted the invoice
     number) — high confidence, auto-confirmed exactly like before.
     Rules 3 & 4 are amount+customer heuristics with NO reference at
     all — lower confidence, and now deliberately NOT auto-applied.
     A human confirms these via POST /reconciliation/:id/confirm
     before the invoice/transaction status actually changes (see
     services/reconciliation.service.js). This directly addresses a
     real risk: an automatic fuzzy match that turns out wrong is a
     financial-state change that's awkward to unwind after the
     fact — better to never commit it un-confirmed in the first
     place. Rule 4's result status was also renamed from
     "AGGREGATED_MATCH" to "AGGREGATED_AMOUNT_MATCH" so it can never
     be confused with Rule 2's reference-based "AGGREGATED_MATCH" in
     reports/audit trails — they used to share an identical status
     string despite having very different confidence levels.
*/

function reconcilePayments(expectedPayments, actualTransactions) {

  // Clone arrays so original data is not mutated
  const expected = [...expectedPayments];
  const actual = [...actualTransactions];

  // Canonical string key for a transaction, computed once per
  // transaction rather than inconsistently at each call site.
  const keyOf = (tx) => String(tx._id || tx.id);

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
       High confidence — auto-confirmed.
    ----------------------------------------------- */

    let match = actual.find(tx =>
      !usedTransactions.has(keyOf(tx)) &&
      tx.reference_no === exp.source_ref &&
      tx.currency === exp.currency &&
      Number(tx.amount) === remainingAmount
    );

    if (match) {

      usedTransactions.add(keyOf(match));

      results.push(buildResult(
        exp,
        [match],
        "PERFECT_MATCH",
        0,
        false // requiresReview
      ));

      continue;
    }

    /* -----------------------------------------------
       Rule 2: Reference + Partial Payment
       High confidence (reference-based) — auto-confirmed.
    ----------------------------------------------- */

    const partialsByRef = actual.filter(tx =>
      !usedTransactions.has(keyOf(tx)) &&
      tx.reference_no === exp.source_ref &&
      tx.currency === exp.currency
    );

    for (const tx of partialsByRef) {

      if (remainingAmount <= 0) break;

      if (tx.amount <= remainingAmount) {

        remainingAmount -= tx.amount;

        usedTransactions.add(keyOf(tx));
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
        variance,
        false // requiresReview — still reference-based
      ));

      continue;
    }

    /* -----------------------------------------------
       Rule 3: Amount + Customer + Date Window (±7 days)
       No reference at all — LOW confidence. Requires
       human review before it's committed.
    ----------------------------------------------- */

    const dueDate = new Date(exp.due_date);

    match = actual.find(tx => {

      if (usedTransactions.has(keyOf(tx))) return false;
      if (tx.currency !== exp.currency) return false;
      if (tx.customer_ref !== exp.customer_id) return false;
      if (Number(tx.amount) !== remainingAmount) return false;

      const txDate = new Date(tx.transaction_date);

      const diffDays =
        Math.abs(txDate - dueDate) / (1000 * 60 * 60 * 24);

      return diffDays <= 7;
    });

    if (match) {

      usedTransactions.add(keyOf(match));

      results.push(buildResult(
        exp,
        [match],
        "AMOUNT_MATCH",
        0,
        true // requiresReview
      ));

      continue;
    }

    /* -----------------------------------------------
       Rule 4: Aggregate by Amount (No Reference)
       No reference, no date window — LOWEST confidence.
       Requires human review before it's committed.
    ----------------------------------------------- */

    const candidates = actual.filter(tx =>
      !usedTransactions.has(keyOf(tx)) &&
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
        usedTransactions.add(keyOf(tx))
      );

      results.push(buildResult(
        exp,
        tempMatches,
        "AGGREGATED_AMOUNT_MATCH", // renamed — was ambiguously
                                    // also "AGGREGATED_MATCH" before,
                                    // identical to Rule 2's status
                                    // despite being far less certain.
        0,
        true // requiresReview
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
      -remainingAmount,
      false // requiresReview — nothing to review, it's just unmatched
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
  variance,
  requiresReview
) {

  return {

    // For DB updates
    expectedId: expected._id || expected.id,

    transactionIds: transactions.map(
      tx => tx._id || tx.id
    ),

    // For reporting
    status,

    expectedAmount: Number(expected.amount),

    matchedAmount: transactions.reduce(
      (sum, t) => sum + Number(t.amount),
      0
    ),

    variance,

    requiresReview,

    method: "AUTO"
  };
}


module.exports = {
  reconcilePayments
};