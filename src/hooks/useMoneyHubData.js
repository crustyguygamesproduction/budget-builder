import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";

export function useMoneyHubData(userId) {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [goals, setGoals] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [aiMessages, setAiMessages] = useState([]);
  const [debts, setDebts] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [statementImports, setStatementImports] = useState([]);
  const [viewerAccess, setViewerAccess] = useState([]);
  const [financialDocuments, setFinancialDocuments] = useState([]);
  const [subscriptionProfile, setSubscriptionProfile] = useState(null);
  const [bankConnections, setBankConnections] = useState([]);
  const [transactionRules, setTransactionRules] = useState([]);
  const [moneySnapshot, setMoneySnapshot] = useState(null);

  const resolveUserId = useCallback((overrideUserId = userId) => overrideUserId || null, [userId]);

  const resetUserData = useCallback(() => {
    setTransactions([]);
    setAccounts([]);
    setGoals([]);
    setReceipts([]);
    setAiMessages([]);
    setDebts([]);
    setInvestments([]);
    setStatementImports([]);
    setViewerAccess([]);
    setFinancialDocuments([]);
    setSubscriptionProfile(null);
    setBankConnections([]);
    setTransactionRules([]);
    setMoneySnapshot(null);
  }, []);

  const loadMoneySnapshot = useCallback(async (overrideUserId = userId) => {
    const scopedUserId = resolveUserId(overrideUserId);
    if (!scopedUserId) {
      setMoneySnapshot(null);
      return;
    }

    const { data, error } = await supabase
      .from("money_understanding_snapshots")
      .select("*")
      .eq("user_id", scopedUserId)
      .eq("model_version", "money-organiser-ai-v1")
      .order("interpreted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setMoneySnapshot(null);
      return;
    }
    setMoneySnapshot(data || null);
  }, [resolveUserId, userId]);

  const loadTransactions = useCallback(async (overrideUserId = userId) => {
    const scopedUserId = resolveUserId(overrideUserId);
    if (!scopedUserId) {
      setTransactions([]);
      return;
    }

    const { data, error } = await supabase
      .from("transactions")
      .select("*, accounts(name, institution)")
      .eq("user_id", scopedUserId)
      .order("transaction_date", { ascending: false });

    if (!error) setTransactions(data || []);
  }, [resolveUserId, userId]);

  const loadAccounts = useCallback(async (overrideUserId = userId) => {
    const scopedUserId = resolveUserId(overrideUserId);
    if (!scopedUserId) {
      setAccounts([]);
      return;
    }

    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: true });

    if (!error) setAccounts(data || []);
  }, [resolveUserId, userId]);

  const loadGoals = useCallback(async (overrideUserId = userId) => {
    const scopedUserId = resolveUserId(overrideUserId);
    if (!scopedUserId) {
      setGoals([]);
      return;
    }

    const { data, error } = await supabase
      .from("money_goals")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("priority", { ascending: true });
    if (!error) setGoals(data || []);
  }, [resolveUserId, userId]);

  const loadReceipts = useCallback(async (overrideUserId = userId) => {
    const scopedUserId = resolveUserId(overrideUserId);
    if (!scopedUserId) {
      setReceipts([]);
      return;
    }

    const { data, error } = await supabase
      .from("receipts")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: false });
    if (!error) setReceipts(data || []);
  }, [resolveUserId, userId]);

  const loadAiMessages = useCallback(async (overrideUserId = userId) => {
    const scopedUserId = resolveUserId(overrideUserId);
    if (!scopedUserId) {
      setAiMessages([]);
      return;
    }

    const { data, error } = await supabase
      .from("ai_messages")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: true });
    if (!error) setAiMessages(data || []);
  }, [resolveUserId, userId]);

  const loadDebts = useCallback(async (overrideUserId = userId) => {
    const scopedUserId = resolveUserId(overrideUserId);
    if (!scopedUserId) {
      setDebts([]);
      return;
    }

    const { data, error } = await supabase
      .from("debts")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: false });
    if (!error) setDebts(data || []);
  }, [resolveUserId, userId]);

  const loadInvestments = useCallback(async (overrideUserId = userId) => {
    const scopedUserId = resolveUserId(overrideUserId);
    if (!scopedUserId) {
      setInvestments([]);
      return;
    }

    const { data, error } = await supabase
      .from("investments")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: false });
    if (!error) setInvestments(data || []);
  }, [resolveUserId, userId]);

  const loadStatementImports = useCallback(async (overrideUserId = userId) => {
    const scopedUserId = resolveUserId(overrideUserId);
    if (!scopedUserId) {
      setStatementImports([]);
      return;
    }

    const { data, error } = await supabase
      .from("statement_imports")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: false });
    if (!error) setStatementImports(data || []);
  }, [resolveUserId, userId]);

  const loadViewerAccess = useCallback(async (overrideUserId = userId) => {
    const scopedUserId = resolveUserId(overrideUserId);
    if (!scopedUserId) {
      setViewerAccess([]);
      return;
    }

    const { data, error } = await supabase
      .from("viewer_access")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: false });
    setViewerAccess(error ? [] : data || []);
  }, [resolveUserId, userId]);

  const loadFinancialDocuments = useCallback(async (overrideUserId = userId) => {
    const scopedUserId = resolveUserId(overrideUserId);
    if (!scopedUserId) {
      setFinancialDocuments([]);
      return;
    }

    const { data, error } = await supabase
      .from("financial_documents")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: false });
    setFinancialDocuments(error ? [] : data || []);
  }, [resolveUserId, userId]);

  const loadSubscriptionProfile = useCallback(async (overrideUserId = userId) => {
    const scopedUserId = resolveUserId(overrideUserId);
    if (!scopedUserId) {
      setSubscriptionProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from("subscription_profiles")
      .select("*")
      .eq("user_id", scopedUserId)
      .maybeSingle();
    setSubscriptionProfile(error ? null : data || null);
  }, [resolveUserId, userId]);

  const loadBankConnections = useCallback(async (overrideUserId = userId) => {
    const scopedUserId = resolveUserId(overrideUserId);
    if (!scopedUserId) {
      setBankConnections([]);
      return;
    }

    const { data, error } = await supabase
      .from("bank_connections")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: false });
    setBankConnections(error ? [] : data || []);
  }, [resolveUserId, userId]);

  const loadTransactionRules = useCallback(async (overrideUserId = userId) => {
    const scopedUserId = resolveUserId(overrideUserId);
    if (!scopedUserId) {
      setTransactionRules([]);
      return;
    }

    const { data, error } = await supabase
      .from("transaction_rules")
      .select("*")
      .eq("user_id", scopedUserId)
      .order("created_at", { ascending: false });
    setTransactionRules(error ? [] : data || []);
  }, [resolveUserId, userId]);

  const loadAllData = useCallback(async (overrideUserId = userId) => {
    const scopedUserId = resolveUserId(overrideUserId);
    if (!scopedUserId) {
      resetUserData();
      return;
    }

    await Promise.all([
      loadTransactions(scopedUserId),
      loadAccounts(scopedUserId),
      loadGoals(scopedUserId),
      loadReceipts(scopedUserId),
      loadAiMessages(scopedUserId),
      loadDebts(scopedUserId),
      loadInvestments(scopedUserId),
      loadStatementImports(scopedUserId),
      loadViewerAccess(scopedUserId),
      loadFinancialDocuments(scopedUserId),
      loadSubscriptionProfile(scopedUserId),
      loadBankConnections(scopedUserId),
      loadTransactionRules(scopedUserId),
      loadMoneySnapshot(scopedUserId),
    ]);
  }, [
    loadAccounts,
    loadAiMessages,
    loadBankConnections,
    loadDebts,
    loadFinancialDocuments,
    loadGoals,
    loadInvestments,
    loadMoneySnapshot,
    loadReceipts,
    loadStatementImports,
    loadSubscriptionProfile,
    loadTransactionRules,
    loadTransactions,
    loadViewerAccess,
    resetUserData,
    resolveUserId,
    userId,
  ]);

  const refreshMoneyOrganiser = useCallback(async (options = {}) => {
    try {
      const { data, error } = await supabase.functions.invoke("money-organiser", {
        body: { force: Boolean(options.force) },
      });
      if (error) throw error;
      if (data?.snapshot) setMoneySnapshot(data.snapshot);
      return data?.snapshot || null;
    } catch (error) {
      console.warn("Money organiser could not run", error);
      return null;
    }
  }, []);

  const refreshMoneyUnderstandingAfterCorrection = useCallback(async () => {
    const scopedUserId = resolveUserId();
    if (!scopedUserId) return;

    await loadTransactionRules(scopedUserId);
    await loadTransactions(scopedUserId);
    await refreshMoneyOrganiser({ force: true });
    await loadMoneySnapshot(scopedUserId);
  }, [loadMoneySnapshot, loadTransactionRules, loadTransactions, refreshMoneyOrganiser, resolveUserId]);

  useEffect(() => {
    if (userId) {
      // Data loading synchronizes app state with Supabase after auth changes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadAllData(userId);
    } else {
      resetUserData();
    }
  }, [loadAllData, resetUserData, userId]);

  return {
    transactions,
    accounts,
    goals,
    receipts,
    aiMessages,
    debts,
    investments,
    statementImports,
    viewerAccess,
    financialDocuments,
    subscriptionProfile,
    bankConnections,
    transactionRules,
    moneySnapshot,
    loadAllData,
    loadAccounts,
    loadGoals,
    loadReceipts,
    loadAiMessages,
    loadDebts,
    loadInvestments,
    loadViewerAccess,
    loadFinancialDocuments,
    loadTransactionRules,
    refreshMoneyOrganiser,
    refreshMoneyUnderstandingAfterCorrection,
  };
}
