import React from "react"
import Link from "next/link"

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[var(--ink-panel)] text-[var(--canvas)]">
      <div className="pb-section pb-container">
        <div className="pb-grid-3 mb-12">
          {/* Brand column */}
          <div>
            <h3 className="font-bold mb-4">Pulseback</h3>
            <p className="text-[var(--lime-soft)] text-sm mb-6">
              The AI operations team your D2C brand can't afford to hire.
            </p>
            <div className="flex gap-4">
              <a href="https://twitter.com" className="text-[var(--canvas)] hover:text-[var(--lime)]">
                Twitter
              </a>
              <a href="https://linkedin.com" className="text-[var(--canvas)] hover:text-[var(--lime)]">
                LinkedIn
              </a>
            </div>
          </div>

          {/* Platform column */}
          <div>
            <h4 className="text-sm font-semibold mb-4 uppercase tracking-widest">Platform</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a href="#checkout" className="text-[var(--canvas)] hover:text-[var(--lime)]">
                  Checkout OS
                </a>
              </li>
              <li>
                <a href="#support" className="text-[var(--canvas)] hover:text-[var(--lime)]">
                  WhatsApp Agent OS
                </a>
              </li>
              <li>
                <a href="#logistics" className="text-[var(--canvas)] hover:text-[var(--lime)]">
                  NDR OS
                </a>
              </li>
              <li>
                <a href="#retention" className="text-[var(--canvas)] hover:text-[var(--lime)]">
                  Retention OS
                </a>
              </li>
              <li>
                <a href="#analytics" className="text-[var(--canvas)] hover:text-[var(--lime)]">
                  Analytics OS
                </a>
              </li>
            </ul>
          </div>

          {/* Company column */}
          <div>
            <h4 className="text-sm font-semibold mb-4 uppercase tracking-widest">Company</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a href="/about" className="text-[var(--canvas)] hover:text-[var(--lime)]">
                  About
                </a>
              </li>
              <li>
                <a href="#blog" className="text-[var(--canvas)] hover:text-[var(--lime)]">
                  Blog
                </a>
              </li>
              <li>
                <a href="#careers" className="text-[var(--canvas)] hover:text-[var(--lime)]">
                  Careers
                </a>
              </li>
              <li>
                <a href="/contact" className="text-[var(--canvas)] hover:text-[var(--lime)]">
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom section */}
        <div className="border-t border-[var(--forest-2)] pt-8 flex flex-col md:flex-row justify-between items-center text-sm text-[var(--text-4)]">
          <p>&copy; 2026 Pulseback. All rights reserved.</p>
          <div className="flex gap-6 mt-4 md:mt-0">
            <a href="#terms" className="hover:text-[var(--lime)]">
              Terms
            </a>
            <a href="#privacy" className="hover:text-[var(--lime)]">
              Privacy
            </a>
            <a href="#status" className="hover:text-[var(--lime)]">
              Status
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
