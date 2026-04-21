"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { CheckCircle2, Zap, ArrowRight } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

const stripePromise =
  typeof window !== "undefined" && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
    : Promise.resolve(null);

export default function BillingCompositePage() {
  const { t } = useAppPreferences();
  const { data: session } = useSession();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [pmError, setPmError] = useState<string | null>(null);
  const [loadingPm, setLoadingPm] = useState(false);
  const [deletingPmId, setDeletingPmId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invError, setInvError] = useState<string | null>(null);
  const [loadingInv, setLoadingInv] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUpgradeConfirm, setShowUpgradeConfirm] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
  const [showAddCard, setShowAddCard] = useState(false);
  const [addingCardError, setAddingCardError] = useState<string | null>(null);
  const [showAddCardFirstHint, setShowAddCardFirstHint] = useState(false);

  const credits = (session?.user as any)?.credits ?? 0;
  const plan = (session?.user as any)?.plan ?? "free";
  const isPro = plan === "pro";

  const handleDeleteAccount = async () => {
    if (deleting) return;
    try {
      setDeleting(true);
      setDeleteError(null);
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to delete account");
      }
      // After deleting account, immediately sign the user out and redirect to homepage
      await signOut({ callbackUrl: "/" });
    } catch (err: any) {
      setDeleteError(err.message ?? "Unexpected error while deleting account.");
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const loadPaymentMethods = async () => {
    setLoadingPm(true);
    setPmError(null);
    try {
      const res = await fetch("/api/billing/payment-methods");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch payment methods.");
      const methods = data.data ?? [];
      setPaymentMethods(methods);
      if (methods.length > 0 && !selectedPaymentMethodId) {
        const defaultMethod = methods.find((m: any) => m.is_default);
        setSelectedPaymentMethodId((defaultMethod ?? methods[0]).id);
      }
    } catch (err: any) {
      setPmError(err.message ?? "Failed to fetch payment methods.");
    } finally {
      setLoadingPm(false);
    }
  };

  // โหลดข้อมูลครั้งเดียวตอน mount เท่านั้น
  // ไม่ใส่ selectedPaymentMethodId ใน deps เพราะจะทำให้ reload ทุกครั้งที่เลือก PM
  useEffect(() => {
    const loadInvoices = async () => {
      setLoadingInv(true);
      setInvError(null);
      try {
        const res = await fetch("/api/billing/invoices");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to fetch invoices.");
        setInvoices(data.data ?? []);
      } catch (err: any) {
        setInvError(err.message ?? "Failed to fetch invoices.");
      } finally {
        setLoadingInv(false);
      }
    };
    void loadPaymentMethods();
    void loadInvoices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenStripePortal = async () => {
    if (openingPortal) return;
    try {
      setOpeningPortal(true);
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Failed to open billing portal.");
      }
      window.location.href = data.url as string;
    } catch (err: any) {
      setPmError(err.message ?? "Failed to open billing portal.");
      setOpeningPortal(false);
    }
  };

  const handleUpgrade = async () => {
    if (loadingCheckout) return;
    try {
      setCheckoutError(null);

      setLoadingCheckout(true);
      const res = await fetch("/api/billing/upgrade", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to upgrade plan.");
      }
      // If upgrade succeeds, you might want to refresh the page or
      // re-fetch session, but for now we just close the modal.
      setShowUpgradeConfirm(false);
    } catch (err: any) {
      setCheckoutError(err.message ?? "Failed to upgrade plan.");
      setLoadingCheckout(false);
    }
  };

  const handleSetDefaultPaymentMethod = async (id: string) => {
    try {
      setPmError(null);
      const res = await fetch(`/api/billing/payment-methods/${id}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to set default payment method.");
      }
      await loadPaymentMethods();
    } catch (err: any) {
      setPmError(err.message ?? "Failed to set default payment method.");
    }
  };

  const handleDeletePaymentMethod = async (id: string) => {
    try {
      setPmError(null);
      setDeletingPmId(id);
      const res = await fetch(`/api/billing/payment-methods/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to delete payment method.");
      }
      if (selectedPaymentMethodId === id) {
        setSelectedPaymentMethodId(null);
      }
      // Optimistically remove from local state so UI updates immediately
      setPaymentMethods((prev) => prev.filter((pm) => pm.id !== id));
      // Then refresh from server in background
      void loadPaymentMethods();
    } catch (err: any) {
      setPmError(err.message ?? "Failed to delete payment method.");
    } finally {
      setDeletingPmId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 sm:space-y-10 w-full px-0 sm:px-0">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 mb-1">{t("การชำระเงิน", "Billing")}</h1>
        <p className="text-slate-600 text-base">
          {t("จัดการแพ็กเกจ วิธีชำระเงิน ใบเสร็จ และบัญชีของคุณ", "Manage your Files Go plan, payment methods, invoices, and account.")}
        </p>
      </div>

      {/* Billing section */}
      <section className="space-y-4">
        {/* Current plan & credits + plans */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                  {t("แพ็กเกจปัจจุบัน", "Current plan")}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  {isPro ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-base font-semibold text-slate-900">
                        Files Go Pro
                      </span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-slate-400" />
                      <span className="text-base font-semibold text-slate-900">
                        {t("ฟรี", "Free")}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                  {t("เครดิต", "Credits")}
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {isPro ? t("ไม่จำกัด", "Unlimited") : credits}
                </p>
              </div>
            </div>

            {checkoutError && (
              <p className="text-xs text-red-600">{checkoutError}</p>
            )}

            {/* Plan options */}
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Free plan card */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">
                    {t("ฟรี", "Free")}
                  </p>
                  <span className="text-sm font-medium text-slate-500">
                    $0 / month
                  </span>
                </div>
                <ul className="text-xs text-slate-600 space-y-1">
                  <li>{t("• เครดิต 9,999 ต่อเดือน (รีเซ็ตทุกเดือน)", "• 9,999 credits per month (resets monthly)")}</li>
                  <li>{t("• อัปโหลดใบแจ้งหนี้พื้นฐาน", "• Basic invoice uploads")}</li>
                </ul>
              </div>

              {/* Pro plan card */}
              <button
                type="button"
                onClick={() => {
                  if (isPro || loadingCheckout) return;
                  if (paymentMethods.length === 0) {
                    setShowAddCard(true);
                    setAddingCardError(null);
                    setShowAddCardFirstHint(true);
                  } else {
                    setShowUpgradeConfirm(true);
                  }
                }}
                disabled={loadingCheckout || isPro}
                className={`rounded-2xl border px-4 py-3 text-left flex flex-col gap-2 cursor-pointer disabled:opacity-70 ${
                  isPro
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-500" />
                    Files Go Pro
                  </p>
                  <span className="text-sm font-medium text-slate-700">
                    ${process.env.NEXT_PUBLIC_PRO_PRICE ?? "19"} / month
                  </span>
                </div>
                <ul className="text-xs text-slate-600 space-y-1">
                  <li>{t("• เครดิตไม่จำกัด", "• Unlimited credits")}</li>
                  <li>{t("• ประมวลผลลำดับความสำคัญสูง", "• Priority processing")}</li>
                  <li>{t("• ต่ออายุรายเดือน และกลับเป็นฟรีถ้าไม่ต่ออายุ", "• Renews monthly; reverts to Free if not renewed")}</li>
                </ul>
                {!isPro && (
                  <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-900">
                    {loadingCheckout ? t("กำลังพาไป...", "Redirecting...") : t("เลือกแพ็กเกจ Pro", "Choose Pro plan")}
                    <ArrowRight className="w-3 h-3" />
                  </div>
                )}
                {isPro && (
                  <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle2 className="w-3 h-3" />
                    {t("แพ็กเกจปัจจุบัน", "Current plan")}
                  </div>
                )}
              </button>
            </div>
          </div>

        {/* Payment methods card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-4">
          <p className="text-base font-semibold text-slate-900">
            Payment methods
          </p>
          <p className="text-sm text-slate-500">
            Manage the card used for your Files Go Pro subscription.
          </p>

          {pmError && (
            <p className="text-sm text-red-600">{pmError}</p>
          )}

          {loadingPm ? (
            <p className="text-sm text-slate-400">Loading payment methods...</p>
          ) : paymentMethods.length === 0 ? (
            <p className="text-sm text-slate-400">
              No saved payment methods found yet.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {paymentMethods.map((pm) => (
                <li
                  key={pm.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 gap-3"
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-700">
                        {pm.brand?.toUpperCase()} •••• {pm.last4}
                      </span>
                      {pm.is_default && (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-100">
                          Default
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      Expires {pm.exp_month}/{pm.exp_year}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!pm.is_default && (
                      <button
                        type="button"
                        onClick={() => handleSetDefaultPaymentMethod(pm.id)}
                        className="px-2 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-40"
                        disabled={deletingPmId === pm.id}
                      >
                        Set default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeletePaymentMethod(pm.id)}
                      disabled={pm.is_default || deletingPmId === pm.id}
                      className="px-2 py-1 rounded-lg border border-red-100 text-xs font-medium text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-40"
                    >
                      {deletingPmId === pm.id ? "Removing..." : "Remove"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {addingCardError && (
            <p className="text-sm text-red-600">{addingCardError}</p>
          )}

          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              onClick={() => {
                setAddingCardError(null);
                setShowAddCardFirstHint(false);
                setShowAddCard(true);
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-60"
            >
              Add new card
            </button>
            <button
              type="button"
              onClick={handleOpenStripePortal}
              disabled={openingPortal}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-60"
            >
              {openingPortal ? "Opening Stripe portal..." : "Open in Stripe"}
            </button>
          </div>
        </div>

        {/* Receipts / invoices card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-4">
          <p className="text-base font-semibold text-slate-900">
            Receipts &amp; invoices
          </p>
          <p className="text-sm text-slate-500">
            View receipts for your Files Go Pro payments.
          </p>

          {invError && (
            <p className="text-sm text-red-600">{invError}</p>
          )}

          {loadingInv ? (
            <p className="text-sm text-slate-400">Loading invoices...</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-slate-400">
              No invoices found for this account yet.
            </p>
          ) : (
            <div className="border border-slate-100 rounded-xl overflow-hidden max-h-72 overflow-y-auto overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500">
                      Amount
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500">
                      Receipt
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const date = inv.created
                      ? new Date(inv.created).toLocaleDateString()
                      : "-";
                    const amount = inv.amount_paid
                      ? (inv.amount_paid / 100).toFixed(2)
                      : "0.00";
                    const currency = inv.currency?.toUpperCase() ?? "USD";
                    return (
                      <tr key={inv.id} className="border-b border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{date}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {amount} {currency}
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {inv.status}
                        </td>
                        <td className="px-3 py-2">
                          {inv.hosted_invoice_url ? (
                            <a
                              href={inv.hosted_invoice_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-teal-600 hover:text-teal-800 underline"
                            >
                              View
                            </a>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Add card modal */}
      {showAddCard && stripePromise && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-base font-semibold text-slate-900">
                Add payment method
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowAddCard(false);
                  setShowAddCardFirstHint(false);
                  setAddingCardError(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {showAddCardFirstHint && (
              <p className="text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                Add a payment method first to upgrade to Files Go Pro.
              </p>
            )}
            {addingCardError && (
              <p className="text-sm text-red-600 mb-3">{addingCardError}</p>
            )}
            <Elements stripe={stripePromise}>
              <AddCardForm
                onSuccess={async () => {
                  setShowAddCard(false);
                  setAddingCardError(null);
                  setShowAddCardFirstHint(false);
                  await loadPaymentMethods();
                }}
                onError={(msg) => setAddingCardError(msg)}
              />
            </Elements>
          </div>
        </div>
      )}

      {/* Upgrade confirmation modal */}
      {showUpgradeConfirm && !isPro && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-6">
            <p className="text-base font-semibold text-slate-900 mb-2">
              Upgrade to Files Go Pro?
            </p>
            <p className="text-sm text-slate-500 mb-4">
              You&apos;ll be redirected to Stripe to confirm and start your Pro subscription for{" "}
              <span className="font-semibold text-slate-900">
                ${process.env.NEXT_PUBLIC_PRO_PRICE ?? "19"}/month
              </span>
              . You can cancel anytime from the Billing Portal.
            </p>

            {paymentMethods.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Choose payment method
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {paymentMethods.map((pm) => {
                    const id = pm.id as string;
                    const isSelected = selectedPaymentMethodId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelectedPaymentMethodId(id)}
                        className={`w-full flex items-center justify-between rounded-xl border px-3 py-2 text-xs cursor-pointer ${
                          isSelected
                            ? "border-slate-900 bg-slate-900/5"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="text-slate-800">
                            {pm.brand?.toUpperCase()} •••• {pm.last4}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Expires {pm.exp_month}/{pm.exp_year}
                          </span>
                        </div>
                        <span
                          className={`w-3 h-3 rounded-full border ${
                            isSelected
                              ? "border-slate-900 bg-slate-900"
                              : "border-slate-300 bg-white"
                          }`}
                        />
                      </button>
                  );
                  })}
                </div>
                <p className="text-[11px] text-slate-500">
                  We&apos;ll use this card in Stripe to start your subscription. You can still change it inside the Billing Portal.
                </p>
              </div>
            )}

            {checkoutError && (
              <p className="text-xs text-red-600 mb-3">{checkoutError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !loadingCheckout && setShowUpgradeConfirm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-60"
                disabled={loadingCheckout}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (loadingCheckout) return;
                  await handleUpgrade();
                }}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 cursor-pointer disabled:opacity-60"
                disabled={loadingCheckout}
              >
                {loadingCheckout ? "Redirecting..." : "Confirm upgrade"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger zone */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-red-600 uppercase tracking-wide">
          Danger zone
        </h2>
        <div className="bg-white rounded-2xl border border-red-100 p-4">
          <p className="text-sm font-medium text-slate-900 mb-1">
            Delete account
          </p>
          <p className="text-xs text-slate-500 mb-3">
            Permanently delete your Files Go account, history, and integration
            settings. This action cannot be undone.
          </p>
          {deleteError && (
            <p className="text-xs text-red-600 mb-2">{deleteError}</p>
          )}
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 cursor-pointer disabled:opacity-60"
          >
            Delete my account
          </button>
        </div>
      </section>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-6">
            <p className="text-base font-semibold text-slate-900 mb-2">
              Delete account?
            </p>
            <p className="text-sm text-slate-500 mb-4">
              This will permanently delete your Files Go account, history, and integration
              settings. This action cannot be undone.
            </p>
            {deleteError && (
              <p className="text-xs text-red-600 mb-3">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !deleting && setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-60"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 cursor-pointer disabled:opacity-60"
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type AddCardFormProps = {
  onSuccess: () => void | Promise<void>;
  onError: (message: string) => void;
};

function AddCardForm({ onSuccess, onError }: AddCardFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const createSetupIntent = async () => {
      try {
        setLoadingIntent(true);
        const res = await fetch("/api/billing/setup-intent", { method: "POST" });
        const data = await res.json();
        if (!res.ok || !data.clientSecret) {
          throw new Error(data.error ?? "Failed to create SetupIntent.");
        }
        setClientSecret(data.clientSecret as string);
      } catch (err: any) {
        console.error("Create setup intent failed", err);
        onError(err.message ?? "Failed to prepare card form.");
      } finally {
        setLoadingIntent(false);
      }
    };

    void createSetupIntent();
  }, [onError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !clientSecret) return;

    try {
      setSubmitting(true);
      onError("");
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error("Card element not found.");
      }

      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (result.error) {
        throw new Error(result.error.message || "Failed to save card.");
      }

      await onSuccess();
    } catch (err: any) {
      console.error("Add card failed", err);
      onError(err.message ?? "Failed to save card.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {loadingIntent && (
        <p className="text-xs text-slate-500">Preparing secure card form...</p>
      )}
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: "14px",
                color: "#0f172a",
                "::placeholder": { color: "#9ca3af" },
              },
            },
          }}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={!stripe || !elements || !clientSecret || submitting}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer disabled:opacity-60"
        >
          {submitting ? "Saving..." : "Save card"}
        </button>
      </div>
    </form>  );
}
