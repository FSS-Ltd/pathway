"use client";

import { motion } from "framer-motion";
import { visibleFirstContainerVariants } from "../lib/motion";

interface PageWrapperProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Reusable page wrapper component that provides consistent fade-in animations
 * for all marketing pages.
 */
export default function PageWrapper({
  children,
  className = "",
}: PageWrapperProps) {
  return (
    <motion.div
      className={className}
      variants={visibleFirstContainerVariants}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}
