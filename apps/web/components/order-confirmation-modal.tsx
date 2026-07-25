"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

interface OrderConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OrderConfirmationModal({
  isOpen,
  onClose,
}: OrderConfirmationModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-pw-text-primary/60 backdrop-blur-[12px]"
            aria-hidden="true"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[420px] rounded-[20px] bg-surface p-8 shadow-[0px_20px_60px_rgba(15,23,42,0.15)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
            >
              {/* Illustration */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.25, ease: "easeOut" }}
                className="mb-6 flex justify-center"
              >
                <svg
                  width="80"
                  height="80"
                  viewBox="0 0 80 80"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <circle
                    cx="40"
                    cy="40"
                    r="38"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-border-subtle"
                  />
                  <path
                    d="M24 40L34 50L56 28"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-status-ok"
                  />
                </svg>
              </motion.div>

              {/* Text content */}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, duration: 0.2, ease: "easeOut" }}
                className="mb-6 text-center"
              >
                <h2
                  id="modal-title"
                  className="mb-2 text-xl font-semibold text-text-primary"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Thank You for Your Subscription
                </h2>
                <p className="text-sm leading-relaxed text-text-muted">
                  Your purchase is confirmed. We're setting up your account and
                  you'll receive an email shortly.
                </p>
              </motion.div>

              {/* Actions */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.26, duration: 0.18, ease: "easeOut" }}
                className="mb-3 w-full"
              >
                <Link
                  href="https://app.nexsteps.dev/login"
                  className="flex w-full items-center justify-center rounded-md bg-accent-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-strong motion-safe:hover:-translate-y-0.5"
                >
                  Go to Dashboard
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.32, duration: 0.18, ease: "easeOut" }}
                className="w-full"
              >
                <Link
                  href="/configure"
                  className="flex w-full items-center justify-center rounded-md border border-border-subtle bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-muted"
                >
                  View Billing & Plans
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
