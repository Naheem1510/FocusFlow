"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Logo } from "@/components/Logo";
import { SidebarContent } from "./Sidebar";

export function MobileTopBar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="fixed top-0 z-50 flex h-14 w-full items-center justify-between border-b border-border-ash bg-background-base px-4 md:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-text-parchment">
          <Menu size={24} strokeWidth={1.75} />
        </button>
        <Logo />
        <span className="w-6" />
      </header>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[55] md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.nav
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
              className="absolute left-0 top-0 flex h-full w-[280px] max-w-[85vw] flex-col border-r border-border-ash bg-background-secondary px-4 py-6"
            >
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="absolute right-3 top-4 text-text-bone hover:text-text-parchment"
              >
                <X size={20} />
              </button>
              <SidebarContent onNavigate={() => setOpen(false)} />
            </motion.nav>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
