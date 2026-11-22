import React, { useState } from 'react';
import {
  ArrowRight,
  Bike,
  CheckCircle2,
  KeyRound,
  Mail,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  UserCog,
  X,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { AccessPass, Restaurant, Rider, StaffMember, UserRoleMode } from '../types';
import { hashEmailForPass } from '../utils/hash';

export interface RoleSessionGrant {
  role: UserRoleMode;
  loginId?: string;
  riderId?: string;
  businessId?: string;
  staffMember?: StaffMember;
  customerEmail?: string;
}

interface RoleAccessModalProps {
  open: boolean;
  currentRole: UserRoleMode;
  isOwnerUser: boolean;
  userEmail?: string | null;
  riders: Rider[];
  restaurants: Restaurant[];
  staffMembers: StaffMember[];
  welcomeTitle?: string;
  welcomeSubtitle?: string;
  reasonLabel?: string;
  onSelectRole: (grant: RoleSessionGrant) => void;
  onOpenBusinessRegister: () => void;
  onRequestGoogleSignIn: () => Promise<unknown>;
  onClose?: () => void;
}

const ROLE_CARDS: Array<{
  id: Exclude<UserRoleMode, 'admin'>;
  title: string;
  subtitle: string;
  Icon: typeof ShoppingBag;
}> = [
  {
    id: 'customer',
    title: 'Customer',
    subtitle: 'Email ID only',
    Icon: ShoppingBag,
  },
  {
    id: 'business',
    title: 'Business Owner',
    subtitle: 'Email + Login ID',
    Icon: Store,
  },
  {
    id: 'staff',
    title: 'Staff / Manager',
    subtitle: 'Email + Login ID',
    Icon: UserCog,
  },
  {
    id: 'rider',
    title: 'Delivery Rider',
    subtitle: 'Email + Login ID',
    Icon: Bike,
  },
];

export function RoleAccessModal({
  open,
  currentRole,
  isOwnerUser,
  userEmail,
  riders,
  restaurants,
  staffMembers,
  welcomeTitle = 'Welcome to HSP delivery',
  welcomeSubtitle = 'Fast, reliable local delivery across Hasilpur & Pakistan.',
  reasonLabel,
  onSelectRole,
  onOpenBusinessRegister,
  onRequestGoogleSignIn,
  onClose,
}: RoleAccessModalProps) {
  const [pendingRole, setPendingRole] = useState<'customer' | 'rider' | 'business' | 'staff' | null>(null);
  const [loginIdInput, setLoginIdInput] = useState('');
  const [partnerEmailInput, setPartnerEmailInput] = useState('');
  const [customerEmailInput, setCustomerEmailInput] = useState(userEmail || '');
  const [verifying, setVerifying] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  if (!open) return null;

  const isValidEmail = (val: string) => {
    const trimmed = val.trim().toLowerCase();
    return Boolean(trimmed && trimmed.includes('@') && trimmed.includes('.'));
  };

  const handleCardClick = (roleId: Exclude<UserRoleMode, 'admin'>) => {
    setAuthError(null);
    setLoginIdInput('');
    if (roleId === 'customer' && userEmail) {
      onSelectRole({ role: 'customer', customerEmail: userEmail });
      return;
    }
    setPendingRole(roleId);
  };

  const handleCustomerEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const email = customerEmailInput.trim().toLowerCase();
    if (!isValidEmail(email)) {
      setAuthError('Please enter a valid Customer Email ID.');
      return;
    }
    onSelectRole({ role: 'customer', customerEmail: email });
  };

  const handleVerifyPartnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingRole || pendingRole === 'customer') return;

    const enteredEmail = partnerEmailInput.trim().toLowerCase();
    const code = loginIdInput.trim().toUpperCase();

    if (!isValidEmail(enteredEmail)) {
      setAuthError('Please enter your Owner-approved Email ID.');
      return;
    }
    if (!code) {
      setAuthError('Please enter your Owner-approved Login ID.');
      return;
    }

    setVerifying(true);
    setAuthError(null);

    try {
      const enteredHash = await hashEmailForPass(enteredEmail);

      if (pendingRole === 'rider') {
        const localRider = riders.find(
          (r) => (r.loginId || '').trim().toUpperCase() === code
        );
        if (localRider) {
          if (localRider.email && localRider.email.trim().toLowerCase() !== enteredEmail) {
            setAuthError('Email ID does not match the Owner-approved email for this Rider Login ID.');
            return;
          }
          onSelectRole({
            role: 'rider',
            riderId: localRider.id,
            loginId: code,
            customerEmail: enteredEmail,
          });
          return;
        }
      }

      if (pendingRole === 'business') {
        const localBiz = restaurants.find(
          (r) =>
            (r.businessLoginId || '').trim().toUpperCase() === code &&
            (!r.approvalStatus || r.approvalStatus === 'approved')
        );
        if (localBiz) {
          if (localBiz.ownerEmail && localBiz.ownerEmail.trim().toLowerCase() !== enteredEmail) {
            setAuthError('Email ID does not match the Owner-approved email for this Business Login ID.');
            return;
          }
          onSelectRole({
            role: 'business',
            businessId: localBiz.id,
            loginId: code,
            customerEmail: enteredEmail,
          });
          return;
        }
      }

      if (pendingRole === 'staff') {
        const localStaff = staffMembers.find(
          (s) => s.loginId.trim().toUpperCase() === code && s.active
        );
        if (localStaff) {
          if (localStaff.email && localStaff.email.trim().toLowerCase() !== enteredEmail) {
            setAuthError('Email ID does not match the Owner-approved email for this Staff Login ID.');
            return;
          }
          onSelectRole({
            role: 'staff',
            staffMember: localStaff,
            loginId: code,
            customerEmail: enteredEmail,
          });
          return;
        }
      }

      // Check Firestore accessPasses/{code} for Owner-issued credentials
      try {
        const snap = await getDoc(doc(db, 'accessPasses', code));
        if (snap.exists()) {
          const pass = snap.data() as AccessPass;
          if (pass.active && pass.roleType === pendingRole) {
            if (pass.emailHash && pass.emailHash !== enteredHash) {
              setAuthError('Email ID does not match the Owner-approved email for this Login ID.');
              return;
            }
            if (pendingRole === 'rider') {
              onSelectRole({
                role: 'rider',
                riderId: pass.targetId,
                loginId: code,
                customerEmail: enteredEmail,
              });
              return;
            }
            if (pendingRole === 'business') {
              onSelectRole({
                role: 'business',
                businessId: pass.targetId,
                loginId: code,
                customerEmail: enteredEmail,
              });
              return;
            }
            if (pendingRole === 'staff') {
              const staffMember: StaffMember = {
                id: pass.targetId,
                name: pass.label,
                role: 'manager',
                email: enteredEmail,
                phone: '',
                city: 'Hasilpur',
                loginId: code,
                monthlySalaryPkr: 0,
                permissions: pass.permissions || {
                  canApproveBusinesses: false,
                  canManageRiders: true,
                  canEditRiderEarnings: false,
                  canManageSalaries: false,
                  canManageOrders: true,
                  canViewAnalytics: true,
                },
                active: true,
                createdAt: new Date().toISOString(),
              };
              onSelectRole({
                role: 'staff',
                staffMember,
                loginId: code,
                customerEmail: enteredEmail,
              });
              return;
            }
          }
        }
      } catch {
        // Ignore network/offline errors and fall through
      }

      setAuthError(
        'Invalid or unapproved Email & Login ID combination. Only Owner-approved accounts can sign in.'
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-y-auto no-print">
      <div className="w-full max-w-2xl rounded-3xl bg-[#0D0D14] border border-amber-500/35 p-6 sm:p-8 shadow-2xl space-y-6 text-white">
        {/* Clean Welcome Banner */}
        <div className="relative rounded-2xl bg-gradient-to-r from-[#1A1405] via-amber-500/15 to-[#1A1405] border border-amber-400/40 p-4 sm:p-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <img
              src="/pwa-192x192.png"
              alt="HSP delivery"
              className="w-12 h-12 rounded-xl border border-amber-400/50 object-cover shrink-0 shadow-md"
            />
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-yellow-400">
                <Sparkles className="w-3.5 h-3.5" />
                {reasonLabel || 'Welcome'}
              </div>
              <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">
                {welcomeTitle}
              </h2>
              <p className="text-xs sm:text-sm font-medium text-amber-100/80">
                {welcomeSubtitle}
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close welcome screen"
              className="p-2 rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-400 hover:text-amber-300 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Simple Role Selector Prompt */}
        <div className="space-y-3">
          <h3 className="text-sm font-extrabold text-zinc-200">
            Who are you? Choose an option to continue:
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ROLE_CARDS.map(({ id, title, subtitle, Icon }) => {
              const active = currentRole === id;
              const selected = pendingRole === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleCardClick(id)}
                  className={`text-left p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                    selected || active
                      ? 'bg-amber-500/15 border-yellow-400 shadow-[0_0_24px_rgba(250,204,21,0.18)]'
                      : 'bg-zinc-900/80 border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-400 text-zinc-950 flex items-center justify-center shadow-md">
                      <Icon className="w-5 h-5 stroke-[2.3]" />
                    </div>
                    {active && <CheckCircle2 className="w-4 h-4 text-yellow-400" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-display font-extrabold text-white">{title}</h4>
                    <p className="text-[11px] font-bold text-amber-400 mt-0.5">{subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Customer Email-Only Gate */}
        {pendingRole === 'customer' && (
          <form
            onSubmit={handleCustomerEmailSubmit}
            className="p-5 rounded-2xl bg-zinc-900/90 border border-amber-500/35 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-extrabold text-yellow-300">
                <Mail className="w-4 h-4" />
                Customer Email Login
              </div>
              <button
                type="button"
                onClick={async () => {
                  await onRequestGoogleSignIn();
                }}
                className="px-3 py-1.5 rounded-xl bg-white text-zinc-950 text-xs font-extrabold hover:bg-amber-100 transition-colors"
              >
                Use Google
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="email"
                required
                value={customerEmailInput}
                onChange={(e) => setCustomerEmailInput(e.target.value)}
                placeholder="Enter your email ID"
                className="flex-1 px-3.5 py-2.5 text-sm font-semibold rounded-xl bg-zinc-950 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 inline-flex items-center justify-center gap-1.5 shrink-0"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            {authError && <p className="text-xs font-bold text-rose-400">{authError}</p>}
          </form>
        )}

        {/* Email + Owner-Approved Login ID Gate for Business / Staff / Rider */}
        {pendingRole && pendingRole !== 'customer' && (
          <form
            onSubmit={handleVerifyPartnerLogin}
            className="p-5 rounded-2xl bg-zinc-900/90 border border-amber-500/40 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-extrabold text-yellow-300">
                <KeyRound className="w-4 h-4" />
                {pendingRole === 'business'
                  ? 'Business Owner Sign In'
                  : pendingRole === 'staff'
                    ? 'Staff / Manager Sign In'
                    : 'Delivery Rider Sign In'}
              </div>
              {pendingRole === 'business' && (
                <button
                  type="button"
                  onClick={onOpenBusinessRegister}
                  className="text-xs font-bold text-amber-300 underline hover:text-yellow-200"
                >
                  Register new store
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="email"
                required
                value={partnerEmailInput}
                onChange={(e) => setPartnerEmailInput(e.target.value)}
                placeholder="Approved Email ID"
                className="px-3.5 py-2.5 text-sm font-semibold rounded-xl bg-zinc-950 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
              />
              <input
                type="text"
                required
                value={loginIdInput}
                onChange={(e) => setLoginIdInput(e.target.value)}
                placeholder={
                  pendingRole === 'rider'
                    ? 'Rider Login ID (e.g. RDR-101)'
                    : pendingRole === 'business'
                      ? 'Business Login ID (e.g. BIZ-101)'
                      : 'Staff Login ID (e.g. MGR-101)'
                }
                className="px-3.5 py-2.5 text-sm font-mono-tabular font-bold uppercase rounded-xl bg-zinc-950 border border-zinc-700 text-yellow-300 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <button
              type="submit"
              disabled={verifying}
              className="w-full px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            >
              {verifying ? 'Verifying...' : 'Verify & Open Account'}
              <ArrowRight className="w-4 h-4" />
            </button>
            {authError && <p className="text-xs font-bold text-rose-400">{authError}</p>}
          </form>
        )}

        {/* Discreet App Owner Access Strip (No Owner Emails Shown) */}
        <div className="pt-4 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-yellow-400 shrink-0" />
            <span>
              {isOwnerUser ? (
                <span className="text-emerald-300 font-semibold">
                  App Owner authorized — ready to enter executive dashboard.
                </span>
              ) : (
                <span>App Owner account requires authorized Google sign-in.</span>
              )}
            </span>
          </div>

          {isOwnerUser ? (
            <button
              type="button"
              onClick={() => onSelectRole({ role: 'admin' })}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 transition-all whitespace-nowrap"
            >
              Enter App Owner Mode
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onRequestGoogleSignIn()}
              className="px-4 py-2 rounded-xl bg-zinc-900 border border-amber-500/40 text-amber-300 text-xs font-bold hover:bg-amber-500/15 transition-colors whitespace-nowrap"
            >
              App Owner Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
