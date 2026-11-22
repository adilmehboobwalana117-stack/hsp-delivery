import { ComponentType, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  BellRing,
  Bike,
  CheckCircle2,
  Globe,
  Headphones,
  Lock,
  LogIn,
  LogOut,
  MapPin,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  handleFirestoreError,
  isOwnerEmail,
  OperationType,
  signInWithGoogle,
  signOutUser,
} from './firebase';
import {
  AccessPass,
  AppSettings,
  AppTab,
  BusinessApprovalStatus,
  BusinessPayout,
  CityConfig,
  DeliveryProofRecord,
  Language,
  MenuItem,
  MenuItemVariety,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PushNotification,
  Restaurant,
  RestaurantReview,
  Rider,
  RiderStatus,
  RiderVehicleType,
  SalaryPayment,
  StaffMember,
  StaffPermissions,
  SupportMessage,
  UserRoleMode,
} from './types';
import {
  DEFAULT_APP_SETTINGS,
  PAKISTAN_CITIES,
  SEED_MENU_ITEMS,
  SEED_RESTAURANTS,
  SEED_REVIEWS,
  SEED_RIDERS,
  SEED_SAMPLE_ORDERS,
  SEED_STAFF_MEMBERS,
  TRANSLATIONS,
  formatPkr,
  getSeedBusinessPayouts,
  getSeedSalaryPayments,
  resolveBusinessCategories,
} from './data/pakistanData';
import { resolveDeliveryRates } from './utils/pricing';
import { resolveCancellationPolicies } from './utils/policies';
import {
  playBusinessOrderBell,
  playOrderReceivedSound,
  playRiderDispatchBell,
  playStatusPing,
  unlockOrderAlertAudio,
} from './utils/sound';
import {
  getNotificationPermissionState,
  requestSystemNotificationPermission,
  setPwaAppBadge,
  showSystemNotification,
  startBackgroundRepeatingInterval,
  SystemNotificationPermission,
} from './utils/orderAlerts';
import { getLoyaltyTier } from './utils/loyalty';
import { hashEmailForPass } from './utils/hash';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoyaltyBadge } from './components/LoyaltyBadge';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SplashScreen } from './components/SplashScreen';
import { RoleAccessModal, RoleSessionGrant } from './components/RoleAccessModal';
import { QRDownloadFooter } from './components/QRDownloadFooter';
import { CancellationPolicyModal, PolicyModalTab } from './components/CancellationPolicyModal';

import { CustomerMarketplace } from './components/CustomerMarketplace';

function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      return factory();
    }
  });
}

const CheckoutDrawer = lazyWithRetry(() =>
  import('./components/CheckoutDrawer').then((m) => ({ default: m.CheckoutDrawer }))
);
const LiveTrackingView = lazyWithRetry(() =>
  import('./components/LiveTrackingView').then((m) => ({ default: m.LiveTrackingView }))
);
const RestaurantPortal = lazyWithRetry(() =>
  import('./components/RestaurantPortal').then((m) => ({ default: m.RestaurantPortal }))
);
const RiderNavigationView = lazyWithRetry(() =>
  import('./components/RiderNavigationView').then((m) => ({ default: m.RiderNavigationView }))
);
const OperationsDashboard = lazyWithRetry(() =>
  import('./components/OperationsDashboard').then((m) => ({ default: m.OperationsDashboard }))
);
const SupportChatDrawer = lazyWithRetry(() =>
  import('./components/SupportChatDrawer').then((m) => ({ default: m.SupportChatDrawer }))
);
const WhatsAppOrderModal = lazyWithRetry(() =>
  import('./components/WhatsAppOrderModal').then((m) => ({ default: m.WhatsAppOrderModal }))
);
import type { WhatsAppOrderSubmitPayload } from './components/WhatsAppOrderModal';

const GRANT_STORAGE_KEY = 'hsp_role_grant';

const ROLE_LABELS: Record<UserRoleMode, string> = {
  customer: 'Customer',
  rider: 'Rider',
  business: 'Business Owner',
  staff: 'Staff / Manager',
  admin: 'App Owner',
};

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

const STATUS_SEQUENCE: OrderStatus[] = [
  'placed',
  'confirmed',
  'preparing',
  'picked_up',
  'on_the_way',
  'delivered',
];

const STATUS_MESSAGES: Record<OrderStatus, string> = {
  placed: 'Order sent directly to the business owner. Waiting for acceptance.',
  confirmed: 'Store accepted your order! Alerting all available riders.',
  preparing: 'Your items are being freshly prepared and packed.',
  picked_up: 'Order picked up! Live rider GPS location is now unlocked.',
  on_the_way: 'Rider is on the way — track live GPS on the map.',
  delivered: 'Order delivered! Please rate your rider.',
  cancelled: 'Order was rejected or cancelled.',
};

const QUICK_REJECTION_PRESETS = [
  'Item out of stock',
  'Store is too busy right now',
  'Shop closing soon',
  'Delivery address outside area',
];

const DEFAULT_DOCUMENT_TITLE = 'HSP delivery — Hasilpur & Pakistan Express Delivery';

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).filter(([, value]) => value !== undefined)
  ) as T;
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [activeTab, setActiveTab] = useState<AppTab>('order');
  const [language, setLanguage] = useState<Language>('en');
  const [selectedCity, setSelectedCity] = useState<CityConfig>(PAKISTAN_CITIES[0]);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [soundMuted, setSoundMuted] = useState(false);
  const [openBusinessRegisterForm, setOpenBusinessRegisterForm] = useState(false);

  // Demo Key Google Maps Quota Banner state
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    try {
      const saved = window.localStorage.getItem('hsp_app_settings');
      if (saved) {
        return { ...DEFAULT_APP_SETTINGS, ...(JSON.parse(saved) as Partial<AppSettings>) };
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_APP_SETTINGS;
  });

  // Domain state (Seeded + Live Firestore sync; excludes admin-deleted businesses)
  const [restaurants, setRestaurants] = useState<Restaurant[]>(() => {
    try {
      const saved = window.localStorage.getItem('hsp_app_settings');
      const deleted = saved
        ? ((JSON.parse(saved) as Partial<AppSettings>).deletedBusinessIds ?? [])
        : [];
      const deletedSet = new Set(deleted);
      return SEED_RESTAURANTS.filter((r) => !deletedSet.has(r.id));
    } catch {
      return SEED_RESTAURANTS;
    }
  });
  const [menuItems, setMenuItems] = useState<MenuItem[]>(SEED_MENU_ITEMS);
  const [reviews, setReviews] = useState<RestaurantReview[]>(SEED_REVIEWS);
  const [orders, setOrders] = useState<Order[]>(SEED_SAMPLE_ORDERS);
  const [riders, setRiders] = useState<Rider[]>(SEED_RIDERS);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>(SEED_STAFF_MEMBERS);
  const [salaryRecords, setSalaryRecords] = useState<SalaryPayment[]>(() =>
    getSeedSalaryPayments()
  );
  const [businessPayouts, setBusinessPayouts] = useState<BusinessPayout[]>(() =>
    getSeedBusinessPayouts()
  );
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(SEED_SAMPLE_ORDERS[0].id);

  // Cart & Drawers
  const [cartRestaurantId, setCartRestaurantId] = useState<string | null>(null);
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [whatsappOrderModalOpen, setWhatsappOrderModalOpen] = useState(false);
  const [highlightedWaOrderId, setHighlightedWaOrderId] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('waOrder');
    } catch {
      return null;
    }
  });
  const [supportOpen, setSupportOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [policyModalTab, setPolicyModalTab] = useState<PolicyModalTab>('customer');
  const [deliveryProofs, setDeliveryProofs] = useState<Record<string, DeliveryProofRecord>>({});
  const openPolicyModal = useCallback((tab: PolicyModalTab = 'customer') => {
    setPolicyModalTab(tab);
    setPolicyModalOpen(true);
  }, []);

  const handleSwitchTab = useCallback((tab: AppTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  // Handle PWA deep links: ?privacy=1, shortcuts (?tab=...), share_target (?share=1), protocol_handlers (?protocol=...), and note_taking (?note=1)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('privacy') === '1' ||
      window.location.hash === '#privacy' ||
      window.location.pathname === '/privacy-policy'
    ) {
      setPolicyModalTab('privacy');
      setPolicyModalOpen(true);
    }

    const tabParam = params.get('tab');
    if (
      tabParam === 'order' ||
      tabParam === 'track' ||
      tabParam === 'restaurant' ||
      tabParam === 'rider' ||
      tabParam === 'dashboard'
    ) {
      setActiveTab(tabParam);
    }

    if (params.get('share') === '1') {
      const sharedText = [params.get('title'), params.get('text'), params.get('url')]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (sharedText) {
        setGlobalSearchQuery(sharedText.slice(0, 120));
        setActiveTab('order');
      }
    }

    const protocolVal = params.get('protocol');
    if (protocolVal) {
      const cleaned = protocolVal.replace(/^web\+hspdelivery:\/?\/?/i, '').trim();
      if (cleaned.toLowerCase().startsWith('track')) {
        setActiveTab('track');
      } else if (cleaned) {
        setGlobalSearchQuery(cleaned.slice(0, 120));
        setActiveTab('order');
      }
    }

    if (params.get('note') === '1') {
      setSupportOpen(true);
    }
  }, []);

  // Push Notifications & Toast
  const [notifications, setNotifications] = useState<PushNotification[]>([
    {
      id: 'notif-welcome',
      title: 'Welcome to HSP delivery · Hasilpur',
      body: 'Food, Grocery, Pharmacy, Bakery & Local Stores — Rs. 80 within 3 km (+Rs. 20/km), Cash on Delivery & live GPS tracking.',
      timestamp: new Date().toISOString(),
      type: 'status',
      read: false,
    },
  ]);
  const [activeToast, setActiveToast] = useState<
    (PushNotification & { actionLabel?: string; onAction?: () => void }) | null
  >(null);
  const [broadcastOrderId, setBroadcastOrderId] = useState<string | null>(null);
  const [broadcastRiderId, setBroadcastRiderId] = useState<string>(
    SEED_RIDERS.find((r) => r.status === 'available')?.id || SEED_RIDERS[0].id
  );
  const [notifPermission, setNotifPermission] = useState<SystemNotificationPermission>(() =>
    getNotificationPermissionState()
  );
  const [dismissedNotifBanner, setDismissedNotifBanner] = useState(false);
  const [businessBellCountdown, setBusinessBellCountdown] = useState<number | null>(null);
  const [riderBellCountdown, setRiderBellCountdown] = useState<number | null>(null);
  const [overlayRejectOrderId, setOverlayRejectOrderId] = useState<string | null>(null);
  const [overlayRejectReason, setOverlayRejectReason] = useState('');
  const [overlayRejectError, setOverlayRejectError] = useState('');

  // Support Chat
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([
    {
      id: 'sup-welcome',
      userId: 'system',
      senderName: 'HSP delivery Support',
      senderRole: 'support',
      text: 'Assalam-o-Alaikum! Welcome to HSP delivery Support. Ask about Hasilpur deliveries, stores, live GPS pins, Cash on Delivery, JazzCash, or EasyPaisa.',
      createdAt: new Date().toISOString(),
    },
  ]);

  const [sessionGrant, setSessionGrant] = useState<RoleSessionGrant>(() => {
    try {
      const saved = window.localStorage.getItem(GRANT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as RoleSessionGrant;
        if (
          parsed &&
          ['customer', 'rider', 'business', 'staff', 'admin'].includes(parsed.role)
        ) {
          return parsed;
        }
      }
    } catch {
      // ignore storage errors
    }
    return { role: 'customer' };
  });
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [rolePromptReason, setRolePromptReason] = useState<string | undefined>(undefined);

  const seenOrderIdsRef = useRef<Record<string, boolean>>({});
  const prevOrderStateRef = useRef<
    Record<string, { status: OrderStatus; riderId?: string; rejectionReason?: string }>
  >({});
  const t = TRANSLATIONS[language];

  const isOwner = Boolean(user && isOwnerEmail(user.email) && user.emailVerified);

  // Unlock Web Audio API on first user gesture so background 15s bells play reliably
  useEffect(() => {
    const unlock = () => {
      unlockOrderAlertAudio();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Auto-dismiss Framer Motion splash screen quickly for smooth load
  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 900);
    return () => window.clearTimeout(timer);
  }, []);

  // Prompt for Role Selection when launched via download link, standalone PWA, or appinstalled
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isDownloadLaunch = params.get('download') === '1';
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    let hasSavedGrant = false;
    try {
      hasSavedGrant = Boolean(window.localStorage.getItem(GRANT_STORAGE_KEY));
    } catch {
      hasSavedGrant = false;
    }

    if (isDownloadLaunch) {
      setRolePromptReason('Direct Download Link · Choose Your Role');
      setRoleModalOpen(true);
      params.delete('download');
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', nextUrl);
    } else if (isStandalone && !hasSavedGrant) {
      setRolePromptReason('App Installed · Select Your Account Role');
      setRoleModalOpen(true);
    } else if (!hasSavedGrant) {
      setRolePromptReason('Welcome to HSP delivery');
      setRoleModalOpen(true);
    }

    const handleInstalled = () => {
      setRolePromptReason('App Installed · Select Your Account Role');
      setRoleModalOpen(true);
    };
    window.addEventListener('appinstalled', handleInstalled);
    return () => window.removeEventListener('appinstalled', handleInstalled);
  }, []);

  // Listen for Google Maps Demo Key Quota events
  useEffect(() => {
    const handler = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  // Push notification helper + sound + optional OS notification & CTA trigger
  const pushNotification = useCallback(
    (
      title: string,
      body: string,
      type: PushNotification['type'],
      playOrderChime = false,
      options?: {
        systemTag?: string;
        actionLabel?: string;
        onAction?: () => void;
      }
    ) => {
      const notif: PushNotification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        body,
        timestamp: new Date().toISOString(),
        type,
        read: false,
      };
      setNotifications((prev) => [notif, ...prev].slice(0, 30));
      setActiveToast({
        ...notif,
        actionLabel: options?.actionLabel,
        onAction: options?.onAction,
      });
      if (playOrderChime) {
        playOrderReceivedSound(soundMuted);
      } else {
        playStatusPing(soundMuted);
      }
      if (options?.systemTag) {
        showSystemNotification({
          title,
          body,
          tag: options.systemTag,
          renotify: true,
          requireInteraction: false,
        });
      }
      setTimeout(() => {
        setActiveToast((curr) => (curr?.id === notif.id ? null : curr));
      }, 6500);
    },
    [soundMuted]
  );

  const handleEnableBackgroundAlerts = async () => {
    unlockOrderAlertAudio();
    const result = await requestSystemNotificationPermission();
    setNotifPermission(result);
    if (result === 'granted') {
      playStatusPing(false);
      showSystemNotification({
        title: 'HSP delivery Alerts Enabled',
        body: 'Background order notifications & 15-second repeating bells are now active even when minimized.',
        tag: 'hsp-alerts-ready',
        renotify: false,
        requireInteraction: false,
      });
      pushNotification(
        'Background Alerts Enabled',
        'Orders will now ring and notify every 15s even if you minimize the app.',
        'status'
      );
    }
  };

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const deletedBusinessIdsRef = useRef<Set<string>>(
    new Set(appSettings.deletedBusinessIds || [])
  );

  useEffect(() => {
    const nextSet = new Set(appSettings.deletedBusinessIds || []);
    deletedBusinessIdsRef.current = nextSet;
    if (nextSet.size > 0) {
      setRestaurants((prev) => prev.filter((r) => !nextSet.has(r.id)));
      setMenuItems((prev) => prev.filter((m) => !nextSet.has(m.restaurantId)));
    }
  }, [appSettings.deletedBusinessIds]);

  // Public Restaurants Firestore listener
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'restaurants'),
      (snap) => {
        const deletedSet = deletedBusinessIdsRef.current;
        const remote = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Restaurant, 'id'>) }))
          .filter((r) => !deletedSet.has(r.id));
        setRestaurants([
          ...remote,
          ...SEED_RESTAURANTS.filter(
            (s) => !deletedSet.has(s.id) && !remote.some((r) => r.id === s.id)
          ),
        ]);
      },
      (err) => {
        console.warn('Restaurants listener info:', err.message);
      }
    );
    return () => unsub();
  }, []);

  // Public App Settings Firestore listener (WhatsApp number, Welcome Banner & Deleted Businesses)
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'appSettings', 'public'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<AppSettings>;
          setAppSettings((prev) => {
            const next = { ...prev, ...data };
            try {
              window.localStorage.setItem('hsp_app_settings', JSON.stringify(next));
            } catch {
              // ignore storage errors
            }
            return next;
          });
        }
      },
      (err) => {
        console.warn('App settings listener info:', err.message);
      }
    );
    return () => unsub();
  }, []);

  // Authenticated Orders (Multi-Role Real-Time Firestore Listeners + Cross-Device Transition Notifications)
  useEffect(() => {
    if (!authReady || !user) return;
    const ownerSignedIn = isOwnerEmail(user.email) && user.emailVerified;
    const ordersRef = collection(db, 'orders');

    const bucketMap: Record<string, Order[]> = {};
    const mergeAndPublishOrders = () => {
      const deduped = new Map<string, Order>();
      Object.values(bucketMap).forEach((list) => {
        list.forEach((ord) => deduped.set(ord.id, ord));
      });
      const remoteOrders = Array.from(deduped.values()).sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || '')
      );

      remoteOrders.forEach((ord) => {
        const prev = prevOrderStateRef.current[ord.id];
        if (!seenOrderIdsRef.current[ord.id]) {
          seenOrderIdsRef.current[ord.id] = true;
          prevOrderStateRef.current[ord.id] = {
            status: ord.status,
            riderId: ord.riderId,
            rejectionReason: ord.rejectionReason,
          };
          if (ord.status === 'placed' && Date.now() - new Date(ord.createdAt).getTime() < 25000) {
            if (ord.orderSource === 'whatsapp') {
              if (ownerSignedIn || sessionGrant.role === 'staff') {
                pushNotification(
                  `New WhatsApp Order · ${ord.orderCode}`,
                  `${ord.customerName} (${ord.customerPhone}) submitted a WhatsApp order (${(ord.distanceKm ?? 0).toFixed(1)} km · Delivery ${formatPkr(ord.deliveryFeePkr)}). Open Admin to confirm & notify riders.`,
                  'order',
                  true,
                  {
                    systemTag: `hsp-wa-new-${ord.id}`,
                    actionLabel: 'Review WhatsApp Order',
                    onAction: () => {
                      setHighlightedWaOrderId(ord.id);
                      setActiveTab('dashboard');
                    },
                  }
                );
              }
            } else {
              playBusinessOrderBell(soundMuted);
            }
          }
          return;
        }

        if (prev) {
          // Step 2: Business Rejected with Reason → notify customer device
          if (prev.status !== 'cancelled' && ord.status === 'cancelled' && ord.rejectionReason) {
            pushNotification(
              `Order Rejected · ${ord.orderCode}`,
              `${ord.restaurantName}: ${ord.rejectionReason}`,
              'status',
              true,
              { systemTag: `hsp-reject-${ord.id}` }
            );
          }

          // Step 2 → Step 3: Business Accepted → notify customer & riders
          if (prev.status === 'placed' && ord.status === 'confirmed') {
            if (ord.customerId === user.uid) {
              pushNotification(
                `Store Accepted · ${ord.orderCode}`,
                `${ord.restaurantName} accepted your order! Alerting all available riders now.`,
                'status',
                false,
                { systemTag: `hsp-accept-${ord.id}` }
              );
            }
          }

          // Step 4: Rider Accepted → notify Customer & Business Owner devices
          if (!prev.riderId && ord.riderId) {
            const isBizOwner =
              ord.restaurantOwnerId === user.uid ||
              (Boolean(user.email) && ord.restaurantOwnerEmail === user.email?.toLowerCase());
            if (ord.customerId === user.uid) {
              pushNotification(
                `Rider Accepted · ${ord.orderCode}`,
                `${ord.riderName || 'An HSP rider'} accepted your order and is heading to ${ord.restaurantName} for pickup.`,
                'status',
                true,
                { systemTag: `hsp-rider-cust-${ord.id}` }
              );
            } else if (isBizOwner) {
              pushNotification(
                `Rider Assigned · ${ord.orderCode}`,
                `${ord.riderName || 'HSP Rider'} (${ord.riderPhone || ''}) accepted ${ord.orderCode} and is coming for pickup.`,
                'status',
                true,
                { systemTag: `hsp-rider-biz-${ord.id}` }
              );
            }
          }

          // Step 5 & Step 6: Order Picked Up → notify Customer & unlock Live Rider GPS
          const wasPrePickup =
            prev.status === 'placed' || prev.status === 'confirmed' || prev.status === 'preparing';
          const isNowPickedUp = ord.status === 'picked_up' || ord.status === 'on_the_way';
          if (wasPrePickup && isNowPickedUp && ord.customerId === user.uid) {
            pushNotification(
              `Order Picked Up! · ${ord.orderCode}`,
              `${ord.riderName || 'Your rider'} picked up your order from ${ord.restaurantName}. Live rider GPS is now unlocked!`,
              'order',
              true,
              {
                systemTag: `hsp-pickup-${ord.id}`,
                actionLabel: 'View Live Rider Location',
                onAction: () => {
                  setSelectedOrderId(ord.id);
                  setActiveTab('track');
                },
              }
            );
          }
        }

        prevOrderStateRef.current[ord.id] = {
          status: ord.status,
          riderId: ord.riderId,
          rejectionReason: ord.rejectionReason,
        };
      });

      setOrders([...remoteOrders, ...SEED_SAMPLE_ORDERS]);
    };

    const unsubList: Array<() => void> = [];
    const attachOrderQuery = (key: string, q: ReturnType<typeof query>) => {
      const unsub = onSnapshot(
        q,
        (snap) => {
          bucketMap[key] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Order, 'id'>),
          }));
          mergeAndPublishOrders();
        },
        (err) => {
          if (key === 'primary') {
            handleFirestoreError(err, OperationType.LIST, 'orders');
          } else {
            console.warn(`Orders sub-listener (${key}) info:`, err.message);
          }
        }
      );
      unsubList.push(unsub);
    };

    if (ownerSignedIn) {
      attachOrderQuery('primary', query(ordersRef));
    } else {
      attachOrderQuery('primary', query(ordersRef, where('customerId', '==', user.uid)));
      if (sessionGrant.role === 'business') {
        attachOrderQuery('bizUid', query(ordersRef, where('restaurantOwnerId', '==', user.uid)));
        if (user.emailVerified && user.email) {
          attachOrderQuery(
            'bizEmail',
            query(ordersRef, where('restaurantOwnerEmail', '==', user.email.toLowerCase()))
          );
        }
      }
      if (sessionGrant.role === 'rider') {
        attachOrderQuery(
          'riderBroadcast',
          query(ordersRef, where('awaitingRiderDispatch', '==', true))
        );
        attachOrderQuery('riderUid', query(ordersRef, where('riderId', '==', user.uid)));
        if (user.emailVerified && user.email) {
          attachOrderQuery(
            'riderEmail',
            query(ordersRef, where('riderEmail', '==', user.email.toLowerCase()))
          );
        }
      }
    }

    const unsubOrders = () => {
      unsubList.forEach((fn) => fn());
    };

    const supportRef = collection(db, 'supportMessages');
    const supportQuery = ownerSignedIn
      ? query(supportRef)
      : query(supportRef, where('userId', '==', user.uid));

    const unsubSupport = onSnapshot(
      supportQuery,
      (snap) => {
        const remoteMsgs = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<SupportMessage, 'id'>) }))
          .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
        if (remoteMsgs.length > 0) {
          setSupportMessages((prev) => {
            const welcome = prev[0];
            return welcome ? [welcome, ...remoteMsgs] : remoteMsgs;
          });
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'supportMessages');
      }
    );

    let unsubRiders: (() => void) | null = null;
    let unsubStaff: (() => void) | null = null;
    let unsubSalaries: (() => void) | null = null;
    let unsubPayouts: (() => void) | null = null;

    if (ownerSignedIn) {
      unsubRiders = onSnapshot(
        collection(db, 'riders'),
        (snap) => {
          const remoteRiders = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Rider, 'id'>) }))
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          setRiders([
            ...remoteRiders,
            ...SEED_RIDERS.filter((s) => !remoteRiders.some((r) => r.id === s.id)),
          ]);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'riders');
        }
      );

      unsubStaff = onSnapshot(
        collection(db, 'staffMembers'),
        (snap) => {
          const remoteStaff = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<StaffMember, 'id'>) }))
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          setStaffMembers([
            ...remoteStaff,
            ...SEED_STAFF_MEMBERS.filter((s) => !remoteStaff.some((r) => r.id === s.id)),
          ]);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'staffMembers');
        }
      );

      unsubSalaries = onSnapshot(
        collection(db, 'salaryRecords'),
        (snap) => {
          const remoteSalaries = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SalaryPayment, 'id'>),
          }));
          const seeds = getSeedSalaryPayments();
          setSalaryRecords([
            ...remoteSalaries,
            ...seeds.filter((s) => !remoteSalaries.some((r) => r.id === s.id)),
          ]);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'salaryRecords');
        }
      );

      unsubPayouts = onSnapshot(
        collection(db, 'businessPayouts'),
        (snap) => {
          const remotePayouts = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<BusinessPayout, 'id'>),
          }));
          const seeds = getSeedBusinessPayouts();
          setBusinessPayouts([
            ...remotePayouts,
            ...seeds.filter((s) => !remotePayouts.some((r) => r.id === s.id)),
          ]);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'businessPayouts');
        }
      );
    } else if (user) {
      const ownerPayoutBuckets: Record<string, BusinessPayout[]> = {};
      const mergeOwnerPayouts = () => {
        const map = new Map<string, BusinessPayout>();
        Object.values(ownerPayoutBuckets)
          .flat()
          .forEach((p) => map.set(p.id, p));
        const remote = Array.from(map.values());
        const seeds = getSeedBusinessPayouts();
        setBusinessPayouts([
          ...remote,
          ...seeds.filter((s) => !remote.some((r) => r.id === s.id)),
        ]);
      };

      const ownerUnsubs: Array<() => void> = [];
      ownerUnsubs.push(
        onSnapshot(
          query(collection(db, 'businessPayouts'), where('ownerId', '==', user.uid)),
          (snap) => {
            ownerPayoutBuckets.byUid = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<BusinessPayout, 'id'>),
            }));
            mergeOwnerPayouts();
          },
          () => {
            // Non-business users may not have matching payout records
          }
        )
      );
      if (user.email) {
        ownerUnsubs.push(
          onSnapshot(
            query(
              collection(db, 'businessPayouts'),
              where('ownerEmail', '==', user.email.toLowerCase())
            ),
            (snap) => {
              ownerPayoutBuckets.byEmail = snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<BusinessPayout, 'id'>),
              }));
              mergeOwnerPayouts();
            },
            () => {
              // ignore scoped permission errors for non-verified accounts
            }
          )
        );
      }
      unsubPayouts = () => ownerUnsubs.forEach((fn) => fn());
    }

    return () => {
      unsubOrders();
      unsubSupport();
      if (unsubRiders) unsubRiders();
      if (unsubStaff) unsubStaff();
      if (unsubSalaries) unsubSalaries();
      if (unsubPayouts) unsubPayouts();
    };
  }, [authReady, user, soundMuted, sessionGrant.role, pushNotification]);

  const syncAccessPass = async (pass: AccessPass, email?: string) => {
    if (!isOwner || !pass.passId) return;
    try {
      const emailHash = email ? await hashEmailForPass(email) : pass.emailHash;
      await setDoc(
        doc(db, 'accessPasses', pass.passId.toUpperCase()),
        stripUndefined({
          ...pass,
          passId: pass.passId.toUpperCase(),
          ...(emailHash ? { emailHash } : {}),
        })
      );
    } catch (err) {
      console.warn('AccessPass sync info:', err);
    }
  };

  // Cart handlers
  const handleAddToCart = (
    restaurant: Restaurant,
    item: MenuItem,
    variety?: MenuItemVariety
  ) => {
    const cartItemId = variety ? `${item.id}::${variety.id}` : item.id;
    const cartItemName = variety ? `${item.name} (${variety.label})` : item.name;
    const cartItemPrice = variety ? variety.pricePkr : item.pricePkr;

    if (cartRestaurantId && cartRestaurantId !== restaurant.id) {
      setCartItems([
        {
          menuItemId: cartItemId,
          name: cartItemName,
          ...(variety ? { varietyLabel: variety.label } : {}),
          pricePkr: cartItemPrice,
          quantity: 1,
          imageUrl: item.imageUrl,
        },
      ]);
      setCartRestaurantId(restaurant.id);
      return;
    }
    setCartRestaurantId(restaurant.id);
    setCartItems((prev) => {
      const existing = prev.find((i) => i.menuItemId === cartItemId);
      if (existing) {
        return prev.map((i) =>
          i.menuItemId === cartItemId ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          menuItemId: cartItemId,
          name: cartItemName,
          ...(variety ? { varietyLabel: variety.label } : {}),
          pricePkr: cartItemPrice,
          quantity: 1,
          imageUrl: item.imageUrl,
        },
      ];
    });
  };

  const handleUpdateCartQty = (menuItemId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((i) => (i.menuItemId === menuItemId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  const handleClearCart = () => {
    setCartItems([]);
    setCartRestaurantId(null);
  };

  const handleReorderPastOrder = (order: Order) => {
    setCartRestaurantId(order.restaurantId);
    setCartItems(order.items.map((item) => ({ ...item })));
    setCheckoutOpen(true);
    pushNotification(
      `Re-order Ready · ${order.restaurantName}`,
      `${order.items.reduce((s, i) => s + i.quantity, 0)} item(s) loaded into your cart for quick checkout.`,
      'order'
    );
  };

  const cartRestaurant = restaurants.find((r) => r.id === cartRestaurantId) || null;

  // Step 1: Customer Places Order (Sent directly to Business Owner first — NOT to riders yet)
  const handlePlaceOrder = async (payload: {
    customerName: string;
    customerPhone: string;
    deliveryAddress: string;
    deliveryNotes: string;
    deliveryLat: number;
    deliveryLng: number;
    distanceKm: number;
    deliveryFeePkr: number;
    tipPkr: number;
    riderEarningPkr: number;
    paymentMethod: PaymentMethod;
    paymentRef?: string;
  }) => {
    if (!cartRestaurant || cartItems.length === 0) return;

    const subtotalPkr = cartItems.reduce((s, i) => s + i.pricePkr * i.quantity, 0);
    const totalPkr = subtotalPkr + payload.deliveryFeePkr + payload.tipPkr;
    const orderId = `ord-${Date.now()}`;
    const orderCode = `HSP-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();

    const newOrderRaw: Order = {
      id: orderId,
      orderCode,
      customerId: user?.uid || 'guest-customer',
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      restaurantId: cartRestaurant.id,
      restaurantName: cartRestaurant.name,
      restaurantOwnerId: cartRestaurant.ownerId || undefined,
      restaurantOwnerEmail: cartRestaurant.ownerEmail?.toLowerCase() || undefined,
      restaurantLat: cartRestaurant.lat,
      restaurantLng: cartRestaurant.lng,
      city: cartRestaurant.city,
      items: cartItems,
      subtotalPkr,
      deliveryFeePkr: payload.deliveryFeePkr,
      tipPkr: payload.tipPkr,
      riderEarningPkr: payload.riderEarningPkr,
      totalPkr,
      paymentMethod: payload.paymentMethod,
      paymentStatus: payload.paymentMethod === 'COD' ? 'pending_cod' : 'paid',
      paymentRef: payload.paymentRef,
      status: 'placed',
      awaitingRiderDispatch: false,
      deliveryAddress: payload.deliveryAddress,
      deliveryNotes: payload.deliveryNotes || undefined,
      deliveryLat: payload.deliveryLat,
      deliveryLng: payload.deliveryLng,
      riderLat: cartRestaurant.lat,
      riderLng: cartRestaurant.lng,
      etaMinutes: cartRestaurant.deliveryTimeMin,
      distanceKm: payload.distanceKm,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const newOrder = stripUndefined(newOrderRaw);

    seenOrderIdsRef.current[orderId] = true;
    prevOrderStateRef.current[orderId] = { status: 'placed' };

    if (user) {
      const { id: _omitId, ...firestoreDoc } = newOrder;
      try {
        await setDoc(doc(db, 'orders', orderId), stripUndefined(firestoreDoc));
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `orders/${orderId}`);
      }
    } else {
      setOrders((prev) => [newOrder, ...prev]);
    }

    pushNotification(
      `Order Placed · ${orderCode}`,
      `Sent directly to ${cartRestaurant.name}. Business owner is being alerted every 15s until they respond.`,
      'order',
      true,
      { systemTag: `hsp-placed-${orderId}` }
    );

    handleClearCart();
    setCheckoutOpen(false);
    setSelectedOrderId(orderId);
    setActiveTab('track');
  };

  // WhatsApp Custom Order Flow (Step 2): Customer attaches photo + note + GPS pin → app calculates delivery fee & generates Admin link
  const handleCreateWhatsAppOrder = async (
    payload: WhatsAppOrderSubmitPayload
  ): Promise<{ order: Order; orderLink: string }> => {
    const orderId = `ord-${Date.now()}`;
    const orderCode = `HSP-WA-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();
    const orderLink = `${window.location.origin}/?waOrder=${orderId}`;
    const noteSummary =
      payload.whatsappItemNote.trim().slice(0, 72) || 'Custom WhatsApp Order';

    const newOrderRaw: Order = {
      id: orderId,
      orderCode,
      orderSource: 'whatsapp',
      customerId: user?.uid || 'guest-customer',
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      restaurantId: 'whatsapp-custom',
      restaurantName: 'WhatsApp Custom Order',
      restaurantLat: selectedCity.center.lat,
      restaurantLng: selectedCity.center.lng,
      city: selectedCity.name,
      items: [
        {
          menuItemId: 'whatsapp-custom',
          name: noteSummary,
          pricePkr: 0,
          quantity: 1,
        },
      ],
      subtotalPkr: 0,
      deliveryFeePkr: payload.deliveryFeePkr,
      tipPkr: 0,
      riderEarningPkr: payload.riderEarningPkr,
      totalPkr: payload.deliveryFeePkr,
      paymentMethod: 'COD',
      paymentStatus: 'pending_cod',
      status: 'placed',
      awaitingRiderDispatch: false,
      deliveryAddress: payload.deliveryAddress,
      deliveryNotes: payload.whatsappItemNote,
      deliveryLat: payload.deliveryLat,
      deliveryLng: payload.deliveryLng,
      riderLat: selectedCity.center.lat,
      riderLng: selectedCity.center.lng,
      etaMinutes: Math.max(15, Math.round(12 + payload.distanceKm * 3.5)),
      distanceKm: payload.distanceKm,
      whatsappItemPhoto: payload.whatsappItemPhoto,
      whatsappItemNote: payload.whatsappItemNote,
      whatsappOrderLink: orderLink,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const newOrder = stripUndefined(newOrderRaw);

    seenOrderIdsRef.current[orderId] = true;
    prevOrderStateRef.current[orderId] = { status: 'placed' };

    if (user) {
      const { id: _omitId, ...firestoreDoc } = newOrder;
      try {
        await setDoc(doc(db, 'orders', orderId), stripUndefined(firestoreDoc));
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `orders/${orderId}`);
      }
    } else {
      setOrders((prev) => [newOrder, ...prev]);
    }

    pushNotification(
      `WhatsApp Order Link Ready · ${orderCode}`,
      `Location checked (${payload.distanceKm.toFixed(1)} km · Delivery ${formatPkr(payload.deliveryFeePkr)}). Send the link to Admin on WhatsApp for confirmation.`,
      'order',
      true,
      { systemTag: `hsp-wa-created-${orderId}` }
    );

    return { order: newOrder, orderLink };
  };

  // WhatsApp Custom Order Flow (Step 3 & 4): Admin confirms WhatsApp order → notifies ALL available riders
  const handleConfirmWhatsAppOrder = async (orderId: string, itemPricePkr = 0) => {
    const nowIso = new Date().toISOString();
    const target = orders.find((o) => o.id === orderId);
    if (!target) return;

    const cleanItemPrice = Math.max(0, Math.round(itemPricePkr || 0));
    const nextItems =
      cleanItemPrice > 0 && target.items.length > 0
        ? target.items.map((item, idx) =>
            idx === 0 ? { ...item, pricePkr: cleanItemPrice } : item
          )
        : target.items;
    const nextSubtotal = cleanItemPrice > 0 ? cleanItemPrice : target.subtotalPkr;
    const nextTotal = nextSubtotal + target.deliveryFeePkr + (target.tipPkr || 0);

    const updates: Partial<Order> = {
      status: 'confirmed',
      awaitingRiderDispatch: true,
      acceptedByBusinessAt: nowIso,
      items: nextItems,
      subtotalPkr: nextSubtotal,
      totalPkr: nextTotal,
      updatedAt: nowIso,
    };

    prevOrderStateRef.current[orderId] = {
      status: 'confirmed',
      riderId: target.riderId,
      rejectionReason: target.rejectionReason,
    };
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)));

    if (user && !orderId.startsWith('ord-demo-')) {
      try {
        await updateDoc(doc(db, 'orders', orderId), updates);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      }
    }

    const availableInCity = riders.filter(
      (r) => r.status === 'available' && r.city === target.city
    );
    const notifiedRiders =
      availableInCity.length > 0
        ? availableInCity
        : riders.filter((r) => r.status === 'available');

    if (notifiedRiders[0]) {
      setBroadcastRiderId(notifiedRiders[0].id);
    }
    setBroadcastOrderId(orderId);
    setHighlightedWaOrderId((curr) => (curr === orderId ? null : curr));

    pushNotification(
      `WhatsApp Order Confirmed · Alerting ${Math.max(1, notifiedRiders.length)} Available Riders`,
      `${target.orderCode} confirmed by Admin (${formatPkr(nextTotal)}). All available riders are being notified every 15s.`,
      'order',
      true,
      { systemTag: `hsp-wa-confirmed-${orderId}` }
    );
  };

  // Step 2A: Business Owner Accepts Order → Stops Business Bell & Dispatches to ALL Available Riders (Step 3)
  const handleBusinessAcceptOrder = async (orderId: string) => {
    const nowIso = new Date().toISOString();
    const target = orders.find((o) => o.id === orderId);
    const updates: Partial<Order> = {
      status: 'confirmed',
      awaitingRiderDispatch: true,
      acceptedByBusinessAt: nowIso,
      updatedAt: nowIso,
    };

    prevOrderStateRef.current[orderId] = {
      status: 'confirmed',
      riderId: target?.riderId,
      rejectionReason: target?.rejectionReason,
    };
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)));

    if (user && !orderId.startsWith('ord-demo-')) {
      try {
        await updateDoc(doc(db, 'orders', orderId), updates);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      }
    }

    const availableInCity = riders.filter(
      (r) => r.status === 'available' && (!target || r.city === target.city)
    );
    const notifiedRiders =
      availableInCity.length > 0
        ? availableInCity
        : riders.filter((r) => r.status === 'available');

    if (notifiedRiders[0]) {
      setBroadcastRiderId(notifiedRiders[0].id);
    }
    setBroadcastOrderId(orderId);

    pushNotification(
      `Order Accepted · Alerting ${Math.max(1, notifiedRiders.length)} Available Riders`,
      `${target?.orderCode || 'Order'} accepted by ${target?.restaurantName || 'store'}. All available riders are ringing every 15s until accepted.`,
      'order',
      true,
      { systemTag: `hsp-biz-accepted-${orderId}` }
    );
  };

  // Step 2B: Business Owner Rejects Order with Mandatory Reason → Automatically Sent to Customer
  const handleBusinessRejectOrder = async (orderId: string, reason: string) => {
    const cleanReason = reason.trim().slice(0, 300);
    if (cleanReason.length < 3) return;
    const nowIso = new Date().toISOString();
    const target = orders.find((o) => o.id === orderId);
    const updates: Partial<Order> = {
      status: 'cancelled',
      awaitingRiderDispatch: false,
      rejectedByBusinessAt: nowIso,
      rejectionReason: cleanReason,
      cancelledBy: 'business',
      cancelledAt: nowIso,
      cancellationReason: cleanReason,
      updatedAt: nowIso,
    };

    prevOrderStateRef.current[orderId] = {
      status: 'cancelled',
      riderId: target?.riderId,
      rejectionReason: cleanReason,
    };
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)));

    if (user && !orderId.startsWith('ord-demo-')) {
      try {
        await updateDoc(doc(db, 'orders', orderId), updates);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      }
    }

    setBroadcastOrderId((curr) => (curr === orderId ? null : curr));

    pushNotification(
      `Order Rejected · ${target?.orderCode || 'Order'}`,
      `Reason sent to ${target?.customerName || 'customer'}: "${cleanReason}"`,
      'status',
      true,
      { systemTag: `hsp-biz-rejected-${orderId}` }
    );
  };

  // Step 4: Rider Accepts Broadcast Order → Stops Rider Bell & Notifies BOTH Customer and Business Owner
  const handleAcceptOrderByRider = async (orderId: string, rider: Rider) => {
    const nowIso = new Date().toISOString();
    const target = orders.find((o) => o.id === orderId);
    const formattedName = `${rider.name} (${rider.vehiclePlate})`;
    const nextStatus: OrderStatus =
      target && target.status === 'placed' ? 'confirmed' : target?.status || 'confirmed';
    const updates = stripUndefined<Partial<Order>>({
      riderId: rider.id,
      riderName: formattedName,
      riderPhone: rider.phone,
      riderEmail: rider.email?.toLowerCase(),
      riderAcceptedAt: nowIso,
      awaitingRiderDispatch: false,
      status: nextStatus,
      updatedAt: nowIso,
    });

    prevOrderStateRef.current[orderId] = {
      status: nextStatus,
      riderId: rider.id,
      rejectionReason: target?.rejectionReason,
    };
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)));
    setRiders((prev) =>
      prev.map((r) => (r.id === rider.id ? { ...r, status: 'on_delivery' } : r))
    );

    if (user && !orderId.startsWith('ord-demo-')) {
      try {
        await updateDoc(doc(db, 'orders', orderId), updates);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      }
    }

    setBroadcastOrderId((curr) => (curr === orderId ? null : curr));
    setSelectedOrderId(orderId);
    setActiveTab('rider');

    // Step 4: Notify BOTH Customer and Business Owner
    pushNotification(
      `Business Notified · Rider Assigned (${target?.orderCode || 'Order'})`,
      `${rider.name} (${rider.phone}) accepted ${target?.orderCode || 'order'} and is arriving at ${target?.restaurantName || 'store'} for pickup.`,
      'status'
    );
    pushNotification(
      `Customer Notified · Rider Accepted (${target?.orderCode || 'Order'})`,
      `${rider.name} (${rider.vehiclePlate}) accepted your order and is heading to ${target?.restaurantName || 'the store'}.`,
      'order',
      true,
      { systemTag: `hsp-rider-accepted-${orderId}` }
    );
  };

  // Step 5 & Step 6: Update Order Status (Pickup triggers Customer notification & unlocks Live Rider GPS)
  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus) => {
    const nowIso = new Date().toISOString();
    const target = orders.find((o) => o.id === orderId);
    const isPickupStep = status === 'picked_up' || (status === 'on_the_way' && !target?.pickedUpAt);
    const updates = stripUndefined<Partial<Order>>({
      status,
      updatedAt: nowIso,
      ...(status === 'confirmed' && !target?.riderId
        ? { awaitingRiderDispatch: true, acceptedByBusinessAt: target?.acceptedByBusinessAt || nowIso }
        : {}),
      ...(isPickupStep
        ? {
            pickedUpAt: nowIso,
            awaitingRiderDispatch: false,
            etaMinutes: Math.max(5, Math.round(((target?.distanceKm ?? 3) / 26) * 60)),
          }
        : {}),
      ...(status === 'delivered' ? { paymentStatus: 'paid', etaMinutes: 0, awaitingRiderDispatch: false } : {}),
      ...(status === 'on_the_way' && target
        ? {
            riderLat: (target.restaurantLat + target.deliveryLat) / 2,
            riderLng: (target.restaurantLng + target.deliveryLng) / 2,
            etaMinutes: 9,
          }
        : {}),
      ...(status === 'delivered' && target
        ? { riderLat: target.deliveryLat, riderLng: target.deliveryLng }
        : {}),
    });

    prevOrderStateRef.current[orderId] = {
      status,
      riderId: target?.riderId,
      rejectionReason: target?.rejectionReason,
    };
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)));

    if (user && !orderId.startsWith('ord-demo-')) {
      try {
        await updateDoc(doc(db, 'orders', orderId), updates);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      }
    }

    if (status === 'picked_up') {
      pushNotification(
        `Order Picked Up! · ${target?.orderCode || 'Order'}`,
        `${target?.riderName || 'HSP Rider'} picked up order from ${target?.restaurantName || 'store'}. Customer notified — live rider GPS location is now unlocked!`,
        'order',
        true,
        {
          systemTag: `hsp-pickedup-${orderId}`,
          actionLabel: 'View Rider Live Location',
          onAction: () => {
            setSelectedOrderId(orderId);
            setActiveTab('track');
          },
        }
      );
    } else {
      pushNotification(
        `${target?.orderCode || 'Order'} · ${status.replace(/_/g, ' ').toUpperCase()}`,
        STATUS_MESSAGES[status],
        'status',
        status === 'placed'
      );
    }
  };

  // Step 7: Rider marks order delivered with optional/mandatory photo proof (stored in Admin-only Firestore subcollection)
  const handleCompleteDeliveryWithProof = async (
    orderId: string,
    proof?: { photoDataUrl: string; capturedAt: string }
  ) => {
    const nowIso = new Date().toISOString();
    const target = orders.find((o) => o.id === orderId);

    if (proof) {
      const proofRecord: DeliveryProofRecord = {
        orderId,
        orderCode: target?.orderCode || orderId,
        riderId: target?.riderId || user?.uid || 'rider',
        riderName: target?.riderName || 'HSP Rider',
        photoDataUrl: proof.photoDataUrl,
        capturedAt: proof.capturedAt,
      };

      if (user && !orderId.startsWith('ord-demo-')) {
        try {
          await setDoc(doc(db, 'orders', orderId, 'deliveryProof', 'proof'), proofRecord);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `orders/${orderId}/deliveryProof/proof`);
          throw new Error('Could not save delivery proof photo. Please check your connection and try again.');
        }
      }

      setDeliveryProofs((prev) => ({ ...prev, [orderId]: proofRecord }));
    }

    const updates = stripUndefined<Partial<Order>>({
      status: 'delivered',
      paymentStatus: 'paid',
      etaMinutes: 0,
      awaitingRiderDispatch: false,
      updatedAt: nowIso,
      ...(target ? { riderLat: target.deliveryLat, riderLng: target.deliveryLng } : {}),
      ...(proof
        ? {
            hasDeliveryProof: true,
            deliveryProofCapturedAt: proof.capturedAt,
          }
        : {}),
    });

    prevOrderStateRef.current[orderId] = {
      status: 'delivered',
      riderId: target?.riderId,
      rejectionReason: target?.rejectionReason,
    };
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)));

    if (user && !orderId.startsWith('ord-demo-')) {
      try {
        await updateDoc(doc(db, 'orders', orderId), updates);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      }
    }

    pushNotification(
      `${target?.orderCode || 'Order'} · DELIVERED`,
      proof
        ? 'Order marked delivered with timestamped photo proof saved for Admin verification.'
        : STATUS_MESSAGES.delivered,
      'status',
      false
    );
  };

  // Admin-only lazy loader for delivery photo proof from /orders/{orderId}/deliveryProof/proof
  const handleLoadDeliveryProof = useCallback(
    async (orderId: string): Promise<DeliveryProofRecord | null> => {
      if (!isOwner) return null;
      if (deliveryProofs[orderId]) {
        return deliveryProofs[orderId];
      }
      if (orderId.startsWith('ord-demo-')) {
        return null;
      }
      try {
        const snap = await getDoc(doc(db, 'orders', orderId, 'deliveryProof', 'proof'));
        if (!snap.exists()) return null;
        const data = snap.data() as DeliveryProofRecord;
        setDeliveryProofs((prev) => ({ ...prev, [orderId]: data }));
        return data;
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `orders/${orderId}/deliveryProof/proof`);
        throw new Error('Could not load delivery proof photo from database.');
      }
    },
    [deliveryProofs, isOwner]
  );

  const handleAdvanceOrderStatus = async (order: Order) => {
    const idx = STATUS_SEQUENCE.indexOf(order.status);
    if (idx < 0 || idx >= STATUS_SEQUENCE.length - 1) return;
    const nextStatus = STATUS_SEQUENCE[idx + 1];
    if (order.status === 'placed' && nextStatus === 'confirmed') {
      await handleBusinessAcceptOrder(order.id);
      return;
    }
    await handleUpdateOrderStatus(order.id, nextStatus);
  };

  // Customer self-cancellation strictly while order is still in 'placed' state (before store accepts)
  const handleCustomerCancelOrder = async (orderId: string, reason?: string) => {
    const target = orders.find((o) => o.id === orderId);
    if (!target || target.status !== 'placed') return;
    const nowIso = new Date().toISOString();
    const cleanReason = (reason || 'Cancelled by customer before store accepted')
      .trim()
      .slice(0, 300);
    const updates: Partial<Order> = {
      status: 'cancelled',
      cancelledBy: 'customer',
      cancelledAt: nowIso,
      cancellationReason: cleanReason.length >= 2 ? cleanReason : 'Cancelled by customer',
      updatedAt: nowIso,
    };
    prevOrderStateRef.current[orderId] = {
      status: 'cancelled',
      riderId: target.riderId,
      rejectionReason: target.rejectionReason,
    };
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)));
    if (user && !orderId.startsWith('ord-demo-')) {
      try {
        await updateDoc(doc(db, 'orders', orderId), updates);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      }
    }
    pushNotification(
      `Order Cancelled · ${target.orderCode}`,
      `You cancelled order ${target.orderCode} before ${target.restaurantName} accepted it (Rs. 0 fee).`,
      'status'
    );
  };

  // Rider "Paid to Office" Cash/Online Settlement Button
  const handleMarkPaidToOffice = async (orderId: string) => {
    const nowIso = new Date().toISOString();
    const target = orders.find((o) => o.id === orderId);
    const updates: Partial<Order> = {
      officeSettled: true,
      officeSettledAt: nowIso,
      updatedAt: nowIso,
    };
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)));
    if (user && !orderId.startsWith('ord-demo-')) {
      try {
        await updateDoc(doc(db, 'orders', orderId), updates);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      }
    }
    pushNotification(
      'Paid to Office Recorded',
      `${target?.orderCode || 'Order'} marked as paid & settled with HSP delivery office.`,
      'payment'
    );
  };

  // WhatsApp Custom Order Flow (Step 5 & 6): Strictly for WhatsApp orders — Rider marks "Amount Already Paid"
  // while keeping normal delivery fee credited to rider's wallet
  const handleMarkWhatsAppAmountAlreadyPaid = async (orderId: string) => {
    const target = orders.find((o) => o.id === orderId);
    if (!target || target.orderSource !== 'whatsapp') return;

    const nowIso = new Date().toISOString();
    const updates: Partial<Order> = {
      whatsappAmountAlreadyPaid: true,
      whatsappAmountAlreadyPaidAt: nowIso,
      paymentStatus: 'paid',
      officeSettled: true,
      officeSettledAt: nowIso,
      updatedAt: nowIso,
    };

    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)));

    if (user && !orderId.startsWith('ord-demo-')) {
      try {
        await updateDoc(doc(db, 'orders', orderId), updates);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      }
    }

    pushNotification(
      'Amount Already Paid Recorded (WhatsApp Order)',
      `${target.orderCode} marked as already paid. Your normal delivery earning (${formatPkr(target.riderEarningPkr ?? 50)}) remains credited to your rider wallet.`,
      'payment'
    );
  };

  // Sync exact pickup-to-drop-off route distance (km) computed by Google Maps Routes API
  const handleUpdateOrderDistance = useCallback(
    async (orderId: string, distanceKm: number) => {
      const rounded = Number(distanceKm.toFixed(1));
      if (!Number.isFinite(rounded) || rounded <= 0) return;
      const nowIso = new Date().toISOString();
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, distanceKm: rounded, updatedAt: nowIso } : o))
      );
      if (user && !orderId.startsWith('ord-demo-')) {
        try {
          await updateDoc(doc(db, 'orders', orderId), {
            distanceKm: rounded,
            updatedAt: nowIso,
          });
        } catch {
          // Non-critical distance refinement write
        }
      }
    },
    [user]
  );

  // Admin: Update Order Payment Method / Reference / Status / Office Settlement
  const handleUpdateOrderPayment = async (
    orderId: string,
    updates: {
      paymentMethod?: PaymentMethod;
      paymentStatus?: PaymentStatus;
      paymentRef?: string;
      officeSettled?: boolean;
    }
  ) => {
    const nowIso = new Date().toISOString();
    const patch: Partial<Order> = stripUndefined({
      ...updates,
      ...(updates.officeSettled !== undefined
        ? { officeSettledAt: updates.officeSettled ? nowIso : undefined }
        : {}),
      updatedAt: nowIso,
    });
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        const next = { ...o, ...patch };
        if (updates.officeSettled === false) {
          delete next.officeSettledAt;
        }
        return next;
      })
    );
    if (user && !orderId.startsWith('ord-demo-')) {
      try {
        await updateDoc(doc(db, 'orders', orderId), patch);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      }
    }
    pushNotification(
      'Order Payment Updated',
      'Payment method, transaction reference, or settlement status saved.',
      'payment'
    );
  };

  // Update Rider GPS Location
  const handleUpdateRiderLocation = useCallback(
    async (orderId: string, lat: number, lng: number, etaMin: number) => {
      const nowIso = new Date().toISOString();
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, riderLat: lat, riderLng: lng, etaMinutes: etaMin, updatedAt: nowIso }
            : o
        )
      );

      if (user && !orderId.startsWith('ord-demo-')) {
        try {
          await updateDoc(doc(db, 'orders', orderId), {
            riderLat: lat,
            riderLng: lng,
            etaMinutes: etaMin,
            updatedAt: nowIso,
          });
        } catch (err) {
          console.warn('GPS sync warning:', err);
        }
      }
    },
    [user]
  );

  // Rate Driver
  const handleRateDriver = async (
    orderId: string,
    rating: number,
    review: string,
    tags: string[]
  ) => {
    const nowIso = new Date().toISOString();
    const updates = {
      driverRating: rating,
      driverReview: review || 'Great delivery experience!',
      driverTags: tags,
      updatedAt: nowIso,
    };
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)));

    if (user && !orderId.startsWith('ord-demo-')) {
      try {
        await updateDoc(doc(db, 'orders', orderId), updates);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      }
    }
    pushNotification('Driver Rating Saved', `Thank you for rating your rider ${rating}.0 stars!`, 'status');
  };

  // Submit Restaurant Review
  const handleSubmitReview = async (restaurantId: string, rating: number, comment: string) => {
    const revId = `rev-${Date.now()}`;
    const newRev: RestaurantReview = {
      id: revId,
      restaurantId,
      authorId: user?.uid || 'guest-reviewer',
      customerName:
        user?.displayName || sessionGrant.customerEmail?.split('@')[0] || 'HSP Customer',
      rating,
      comment,
      createdAt: new Date().toISOString(),
    };
    setReviews((prev) => [newRev, ...prev]);

    if (user && !restaurantId.startsWith('rest-')) {
      const { id: _id, ...payload } = newRev;
      try {
        await setDoc(doc(db, 'restaurants', restaurantId, 'reviews', revId), payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `restaurants/${restaurantId}/reviews/${revId}`);
      }
    }
    pushNotification('Review Published', 'Your store review is now live.', 'status');
  };

  // Merchant: Add Business / Store (Requires App Owner Approval & Login ID unless App Owner)
  const handleAddRestaurant = async (
    rest: Omit<Restaurant, 'id' | 'ownerId' | 'rating' | 'reviewCount' | 'isOpen'>
  ) => {
    const id = `rest-${Date.now()}`;
    const approvalStatus: BusinessApprovalStatus = isOwner ? 'approved' : 'pending';
    const autoLoginId = isOwner ? `BIZ-${107 + restaurants.length}` : undefined;
    const created = stripUndefined<Restaurant>({
      ...rest,
      id,
      ownerId: user?.uid || 'merchant-local',
      rating: 4.9,
      reviewCount: 1,
      isOpen: true,
      approvalStatus,
      businessLoginId: autoLoginId,
    });

    setRestaurants((prev) => [created, ...prev]);

    if (user) {
      const { id: _id, ...payload } = created;
      try {
        await setDoc(doc(db, 'restaurants', id), stripUndefined(payload));
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `restaurants/${id}`);
      }
    }

    if (approvalStatus === 'approved' && autoLoginId) {
      await syncAccessPass(
        {
          passId: autoLoginId,
          roleType: 'business',
          targetId: id,
          label: created.name,
          active: true,
        },
        created.ownerEmail
      );
      pushNotification(
        'Business Approved & Live',
        `${created.name} is live in ${created.city} · Business Login ID: ${autoLoginId}`,
        'status'
      );
    } else {
      pushNotification(
        'Submitted · Pending App Owner Approval',
        `${created.name} is saved and awaiting App Owner approval & Business Login ID.`,
        'status'
      );
    }
  };

  // App Owner / Permitted Staff: Approve or Reject Business Registration
  const handleUpdateBusinessApproval = async (
    restaurantId: string,
    status: 'approved' | 'rejected',
    businessLoginId?: string
  ) => {
    const canApprove =
      isOwner || Boolean(sessionGrant.staffMember?.permissions.canApproveBusinesses);
    if (!canApprove) {
      pushNotification(
        'App Owner Permission Required',
        'Please sign in as App Owner or a permitted Manager to approve businesses.',
        'status'
      );
      return;
    }

    const updatedAt = new Date().toISOString();
    const target = restaurants.find((r) => r.id === restaurantId);
    const assignedCode =
      businessLoginId?.trim().toUpperCase() ||
      target?.businessLoginId ||
      `BIZ-${107 + restaurants.length}`;

    setRestaurants((prev) =>
      prev.map((r) =>
        r.id === restaurantId
          ? {
              ...r,
              approvalStatus: status,
              ...(status === 'approved' ? { businessLoginId: assignedCode } : {}),
            }
          : r
      )
    );

    if (!SEED_RESTAURANTS.some((s) => s.id === restaurantId)) {
      try {
        await updateDoc(
          doc(db, 'restaurants', restaurantId),
          stripUndefined({
            approvalStatus: status,
            businessLoginId: status === 'approved' ? assignedCode : undefined,
            updatedAt,
          })
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `restaurants/${restaurantId}`);
      }
    }

    if (status === 'approved') {
      await syncAccessPass(
        {
          passId: assignedCode,
          roleType: 'business',
          targetId: restaurantId,
          label: target?.name || 'Business Store',
          active: true,
        },
        target?.ownerEmail
      );
    }

    pushNotification(
      status === 'approved'
        ? `Business Approved · ID ${assignedCode}`
        : 'Business Registration Rejected',
      status === 'approved'
        ? `${target?.name || 'Business'} is live. Share Business Login ID ${assignedCode} with the owner.`
        : `${target?.name || 'Business'} was marked as rejected.`,
      'status'
    );
  };

  const handleAssignBusinessLoginId = async (restaurantId: string, businessLoginId: string) => {
    const cleanCode = businessLoginId.trim().toUpperCase();
    if (!cleanCode) return;
    const target = restaurants.find((r) => r.id === restaurantId);
    setRestaurants((prev) =>
      prev.map((r) => (r.id === restaurantId ? { ...r, businessLoginId: cleanCode } : r))
    );
    if (!SEED_RESTAURANTS.some((s) => s.id === restaurantId)) {
      try {
        await updateDoc(doc(db, 'restaurants', restaurantId), {
          businessLoginId: cleanCode,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `restaurants/${restaurantId}`);
      }
    }
    await syncAccessPass(
      {
        passId: cleanCode,
        roleType: 'business',
        targetId: restaurantId,
        label: target?.name || 'Business Store',
        active: true,
      },
      target?.ownerEmail
    );
    pushNotification(
      'Business Login ID Saved',
      `${target?.name || 'Store'} Login ID updated to ${cleanCode}.`,
      'status'
    );
  };

  // App Owner or Business Owner: Update Business Details / Opening & Delivery Timings
  const handleUpdateBusinessDetails = async (
    restaurantId: string,
    updates: Partial<Restaurant>
  ) => {
    const target = restaurants.find((r) => r.id === restaurantId);
    const cleaned = stripUndefined({
      ...updates,
      ...(updates.businessLoginId
        ? { businessLoginId: updates.businessLoginId.trim().toUpperCase() }
        : {}),
      updatedAt: new Date().toISOString(),
    });
    setRestaurants((prev) =>
      prev.map((r) => (r.id === restaurantId ? { ...r, ...cleaned } : r))
    );
    const isSeedStore = SEED_RESTAURANTS.some((s) => s.id === restaurantId);
    const isStoreOwnerUser =
      Boolean(user) &&
      (target?.ownerId === user?.uid ||
        (Boolean(target?.ownerEmail) &&
          target?.ownerEmail?.toLowerCase() === user?.email?.toLowerCase()));

    if (!isSeedStore && (isOwner || isStoreOwnerUser)) {
      const firestorePayload = isOwner
        ? cleaned
        : stripUndefined({
            businessOpenTime: cleaned.businessOpenTime,
            businessCloseTime: cleaned.businessCloseTime,
            deliveryOpenTime: cleaned.deliveryOpenTime,
            deliveryCloseTime: cleaned.deliveryCloseTime,
            isOpen: cleaned.isOpen,
            updatedAt: cleaned.updatedAt,
          });
      try {
        await updateDoc(doc(db, 'restaurants', restaurantId), firestorePayload);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `restaurants/${restaurantId}`);
      }
    }
    if (isOwner) {
      const nextLoginId = cleaned.businessLoginId || target?.businessLoginId;
      const nextEmail = cleaned.ownerEmail ?? target?.ownerEmail;
      if (nextLoginId) {
        await syncAccessPass(
          {
            passId: nextLoginId,
            roleType: 'business',
            targetId: restaurantId,
            label: cleaned.name || target?.name || 'Business Store',
            active: (cleaned.approvalStatus || target?.approvalStatus || 'approved') === 'approved',
          },
          nextEmail
        );
      }
    }
    pushNotification(
      'Business Details Saved',
      `${cleaned.name || target?.name || 'Business'} timings & record updated.`,
      'status'
    );
  };

  const handleDeleteBusiness = async (restaurantId: string) => {
    const target = restaurants.find((r) => r.id === restaurantId);
    const nextDeletedIds = Array.from(
      new Set([...(appSettings.deletedBusinessIds || []), restaurantId])
    ).slice(0, 200);
    deletedBusinessIdsRef.current = new Set(nextDeletedIds);

    setRestaurants((prev) => prev.filter((r) => r.id !== restaurantId));
    setMenuItems((prev) => prev.filter((m) => m.restaurantId !== restaurantId));
    if (cartRestaurantId === restaurantId) {
      setCartItems([]);
      setCartRestaurantId(null);
    }
    if (sessionGrant.businessId === restaurantId) {
      setSessionGrant({ role: 'customer' });
    }

    const nextSettings = stripUndefined<AppSettings>({
      ...appSettings,
      deletedBusinessIds: nextDeletedIds,
      updatedAt: new Date().toISOString(),
    });
    setAppSettings(nextSettings);
    try {
      window.localStorage.setItem('hsp_app_settings', JSON.stringify(nextSettings));
    } catch {
      // ignore storage errors
    }

    if (isOwner) {
      try {
        await setDoc(doc(db, 'appSettings', 'public'), nextSettings);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'appSettings/public');
      }
      if (!SEED_RESTAURANTS.some((s) => s.id === restaurantId)) {
        try {
          await deleteDoc(doc(db, 'restaurants', restaurantId));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `restaurants/${restaurantId}`);
        }
      }
      if (target?.businessLoginId) {
        await deleteDoc(
          doc(db, 'accessPasses', target.businessLoginId.toUpperCase())
        ).catch(() => undefined);
      }
    }
    pushNotification(
      'Business Permanently Removed',
      `${target?.name || 'Business'} and its catalog products were removed from HSP delivery.`,
      'status'
    );
  };

  // Merchant: Add Product / Menu Item
  const handleAddMenuItem = async (item: Omit<MenuItem, 'id' | 'ownerId'>) => {
    const id = `dish-${Date.now()}`;
    const created = stripUndefined<MenuItem>({
      ...item,
      id,
      ownerId: user?.uid || 'merchant-local',
    });
    setMenuItems((prev) => [created, ...prev]);

    if (user && !SEED_RESTAURANTS.some((s) => s.id === item.restaurantId)) {
      const { id: _id, ...payload } = created;
      try {
        await setDoc(
          doc(db, 'restaurants', item.restaurantId, 'menuItems', id),
          stripUndefined(payload)
        );
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.CREATE,
          `restaurants/${item.restaurantId}/menuItems/${id}`
        );
      }
    }
    pushNotification(
      'Product Published',
      `${created.name} (${formatPkr(created.pricePkr)}) added to catalog.`,
      'status'
    );
  };

  // Business Owner / App Owner / Admin Manager: Edit Menu Item Price & Photo
  const handleUpdateMenuItem = async (itemId: string, updates: Partial<MenuItem>) => {
    const target = menuItems.find((m) => m.id === itemId);
    const cleaned = stripUndefined({
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    setMenuItems((prev) => prev.map((m) => (m.id === itemId ? { ...m, ...cleaned } : m)));
    if (
      target &&
      user &&
      !SEED_RESTAURANTS.some((s) => s.id === target.restaurantId) &&
      (isOwner || target.ownerId === user.uid)
    ) {
      try {
        await updateDoc(
          doc(db, 'restaurants', target.restaurantId, 'menuItems', itemId),
          cleaned
        );
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `restaurants/${target.restaurantId}/menuItems/${itemId}`
        );
      }
    }
    pushNotification(
      'Product Updated',
      `${cleaned.name || target?.name || 'Product'} price & details saved.`,
      'status'
    );
  };

  // Customer Support Chat
  const handleSendSupportMessage = async (text: string, orderCode?: string) => {
    const msgId = `msg-${Date.now()}`;
    const customerMsgRaw: SupportMessage = {
      id: msgId,
      userId: user?.uid || 'guest-user',
      senderName: user?.displayName || sessionGrant.customerEmail || 'You',
      senderRole: 'customer',
      orderCode: orderCode || undefined,
      text,
      createdAt: new Date().toISOString(),
    };
    const customerMsg = stripUndefined(customerMsgRaw);

    if (user) {
      const { id: _id, ...payload } = customerMsg;
      try {
        await setDoc(doc(db, 'supportMessages', msgId), payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `supportMessages/${msgId}`);
      }
    } else {
      setSupportMessages((prev) => [...prev, customerMsg]);
    }

    setTimeout(() => {
      const reply: SupportMessage = {
        id: `rep-${Date.now()}`,
        userId: user?.uid || 'guest-user',
        senderName: 'Ayesha · HSP Care',
        senderRole: 'support',
        ...(orderCode ? { orderCode } : {}),
        text: `Thank you for contacting HSP delivery Care${orderCode ? ` regarding ${orderCode}` : ''}. Our ${selectedCity.name} dispatch desk has logged your inquiry and notified your assigned rider.`,
        createdAt: new Date().toISOString(),
      };
      setSupportMessages((prev) => [...prev, reply]);
      playStatusPing(soundMuted);
    }, 900);
  };

  // Rider Fleet & Compensation Handlers
  const handleAddRider = async (payload: {
    name: string;
    email?: string;
    phone: string;
    cnic?: string;
    city: string;
    vehicleType: RiderVehicleType;
    vehiclePlate: string;
    loginId: string;
    monthlySalaryPkr: number;
  }) => {
    const id = `rider-${Date.now()}`;
    const newRiderRaw: Rider = {
      id,
      name: payload.name,
      email: payload.email?.trim().toLowerCase() || undefined,
      phone: payload.phone,
      cnic: payload.cnic,
      city: payload.city,
      vehicleType: payload.vehicleType,
      vehiclePlate: payload.vehiclePlate,
      loginId: payload.loginId.trim().toUpperCase(),
      monthlySalaryPkr: payload.monthlySalaryPkr,
      walletBonusPkr: 0,
      status: 'available',
      rating: 5.0,
      completedDeliveries: 0,
      createdAt: new Date().toISOString(),
    };
    const newRider = stripUndefined(newRiderRaw);

    if (isOwner) {
      const { id: _id, ...firestorePayload } = newRider;
      try {
        await setDoc(doc(db, 'riders', id), firestorePayload);
        if (newRider.loginId) {
          await syncAccessPass(
            {
              passId: newRider.loginId,
              roleType: 'rider',
              targetId: id,
              label: newRider.name,
              active: true,
            },
            newRider.email
          );
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `riders/${id}`);
      }
    } else {
      setRiders((prev) => [newRider, ...prev]);
    }
    pushNotification(
      'New Rider Added',
      `${newRider.name} (${newRider.vehiclePlate}) · Login ID: ${newRider.loginId}`,
      'status'
    );
  };

  const handleUpdateRiderStatus = async (riderId: string, status: RiderStatus) => {
    setRiders((prev) => prev.map((r) => (r.id === riderId ? { ...r, status } : r)));
    if (isOwner && !SEED_RIDERS.some((s) => s.id === riderId)) {
      try {
        await updateDoc(doc(db, 'riders', riderId), { status });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `riders/${riderId}`);
      }
    }
  };

  const handleUpdateRiderCompensation = async (
    riderId: string,
    updates: { monthlySalaryPkr?: number; walletBonusPkr?: number; loginId?: string }
  ) => {
    const cleaned = stripUndefined(updates);
    setRiders((prev) => prev.map((r) => (r.id === riderId ? { ...r, ...cleaned } : r)));
    if (isOwner && !SEED_RIDERS.some((s) => s.id === riderId)) {
      try {
        await updateDoc(doc(db, 'riders', riderId), cleaned);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `riders/${riderId}`);
      }
    }
    pushNotification('Rider Wallet Updated', 'Rider wallet adjustment saved.', 'status');
  };

  const handleUpdateRiderDetails = async (riderId: string, updates: Partial<Rider>) => {
    const target = riders.find((r) => r.id === riderId);
    const cleaned = stripUndefined({
      ...updates,
      ...(updates.loginId ? { loginId: updates.loginId.trim().toUpperCase() } : {}),
      ...(updates.email ? { email: updates.email.trim().toLowerCase() } : {}),
    });
    setRiders((prev) => prev.map((r) => (r.id === riderId ? { ...r, ...cleaned } : r)));
    if (isOwner && !SEED_RIDERS.some((s) => s.id === riderId)) {
      try {
        await updateDoc(doc(db, 'riders', riderId), cleaned);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `riders/${riderId}`);
      }
    }
    const nextLoginId = cleaned.loginId || target?.loginId;
    const nextEmail = cleaned.email ?? target?.email;
    if (nextLoginId) {
      await syncAccessPass(
        {
          passId: nextLoginId,
          roleType: 'rider',
          targetId: riderId,
          label: cleaned.name || target?.name || 'Rider',
          active: true,
        },
        nextEmail
      );
    }
    pushNotification('Rider Updated', `${cleaned.name || target?.name || 'Rider'} details saved.`, 'status');
  };

  const handleDeleteRider = async (riderId: string) => {
    setRiders((prev) => prev.filter((r) => r.id !== riderId));
    if (isOwner && !SEED_RIDERS.some((s) => s.id === riderId)) {
      try {
        await deleteDoc(doc(db, 'riders', riderId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `riders/${riderId}`);
      }
    }
    pushNotification('Rider Removed', 'Rider removed from active fleet roster.', 'status');
  };

  const handleAssignRiderToOrder = async (orderId: string, rider: Rider) => {
    const nowIso = new Date().toISOString();
    const formattedName = `${rider.name} (${rider.vehiclePlate})`;
    const updates = {
      riderId: rider.id,
      riderName: formattedName,
      riderPhone: rider.phone,
      updatedAt: nowIso,
    };
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)));
    if (user && !orderId.startsWith('ord-demo-')) {
      try {
        await updateDoc(doc(db, 'orders', orderId), updates);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      }
    }
    pushNotification('Rider Dispatched', `${rider.name} assigned to order.`, 'status');
  };

  const handleUpdateOrderRiderEarning = async (orderId: string, riderEarningPkr: number) => {
    const nowIso = new Date().toISOString();
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, riderEarningPkr, updatedAt: nowIso } : o))
    );
    if (user && !orderId.startsWith('ord-demo-')) {
      try {
        await updateDoc(doc(db, 'orders', orderId), { riderEarningPkr, updatedAt: nowIso });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      }
    }
    pushNotification(
      'Rider Trip Pay Updated',
      `Trip rider earning updated to ${formatPkr(riderEarningPkr)}.`,
      'status'
    );
  };

  // Staff & Manager Handlers (App Owner only)
  const handleAddStaffMember = async (payload: {
    name: string;
    role: 'manager' | 'staff';
    email?: string;
    phone: string;
    city: string;
    loginId: string;
    monthlySalaryPkr: number;
    permissions: StaffPermissions;
  }) => {
    const id = `staff-${Date.now()}`;
    const newStaffRaw: StaffMember = {
      id,
      name: payload.name,
      role: payload.role,
      email: payload.email?.trim().toLowerCase() || undefined,
      phone: payload.phone,
      city: payload.city,
      loginId: payload.loginId.trim().toUpperCase(),
      monthlySalaryPkr: payload.monthlySalaryPkr,
      permissions: payload.permissions,
      active: true,
      createdAt: new Date().toISOString(),
    };
    const newStaff = stripUndefined(newStaffRaw);
    setStaffMembers((prev) => [newStaff, ...prev]);

    if (isOwner) {
      const { id: _id, ...firestorePayload } = newStaff;
      try {
        await setDoc(doc(db, 'staffMembers', id), firestorePayload);
        await syncAccessPass(
          {
            passId: newStaff.loginId,
            roleType: 'staff',
            targetId: id,
            label: newStaff.name,
            active: true,
            permissions: newStaff.permissions,
          },
          newStaff.email
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `staffMembers/${id}`);
      }
    }
    pushNotification(
      `${newStaff.role === 'manager' ? 'Manager' : 'Staff'} Added`,
      `${newStaff.name} · Owner-Issued Login ID: ${newStaff.loginId}`,
      'status'
    );
  };

  const handleUpdateStaffDetails = async (staffId: string, updates: Partial<StaffMember>) => {
    const target = staffMembers.find((s) => s.id === staffId);
    const cleaned = stripUndefined({
      ...updates,
      ...(updates.loginId ? { loginId: updates.loginId.trim().toUpperCase() } : {}),
      ...(updates.email ? { email: updates.email.trim().toLowerCase() } : {}),
    });
    setStaffMembers((prev) => prev.map((s) => (s.id === staffId ? { ...s, ...cleaned } : s)));
    if (isOwner && !SEED_STAFF_MEMBERS.some((s) => s.id === staffId)) {
      try {
        await updateDoc(doc(db, 'staffMembers', staffId), cleaned);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `staffMembers/${staffId}`);
      }
    }
    const nextLoginId = cleaned.loginId || target?.loginId;
    const nextEmail = cleaned.email ?? target?.email;
    if (nextLoginId) {
      await syncAccessPass(
        {
          passId: nextLoginId,
          roleType: 'staff',
          targetId: staffId,
          label: cleaned.name || target?.name || 'Staff',
          active: cleaned.active ?? target?.active ?? true,
          permissions: cleaned.permissions || target?.permissions,
        },
        nextEmail
      );
    }
    pushNotification('Staff Details Saved', `${cleaned.name || target?.name || 'Staff'} updated.`, 'status');
  };

  const handleUpdateStaffPermissions = async (
    staffId: string,
    permissions: StaffPermissions
  ) => {
    const target = staffMembers.find((s) => s.id === staffId);
    setStaffMembers((prev) =>
      prev.map((s) => (s.id === staffId ? { ...s, permissions } : s))
    );
    if (isOwner && !SEED_STAFF_MEMBERS.some((s) => s.id === staffId)) {
      try {
        await updateDoc(doc(db, 'staffMembers', staffId), { permissions });
        if (target?.loginId) {
          await syncAccessPass(
            {
              passId: target.loginId,
              roleType: 'staff',
              targetId: staffId,
              label: target.name,
              active: target.active,
              permissions,
            },
            target.email
          );
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `staffMembers/${staffId}`);
      }
    }
    pushNotification('Staff Permissions Updated', `${target?.name || 'Member'} permissions saved.`, 'status');
  };

  const handleToggleStaffActive = async (staffId: string, active: boolean) => {
    const target = staffMembers.find((s) => s.id === staffId);
    setStaffMembers((prev) => prev.map((s) => (s.id === staffId ? { ...s, active } : s)));
    if (isOwner && !SEED_STAFF_MEMBERS.some((s) => s.id === staffId)) {
      try {
        await updateDoc(doc(db, 'staffMembers', staffId), { active });
        if (target?.loginId) {
          await syncAccessPass(
            {
              passId: target.loginId,
              roleType: 'staff',
              targetId: staffId,
              label: target.name,
              active,
              permissions: target.permissions,
            },
            target.email
          );
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `staffMembers/${staffId}`);
      }
    }
  };

  const handleDeleteStaffMember = async (staffId: string) => {
    setStaffMembers((prev) => prev.filter((s) => s.id !== staffId));
    if (isOwner && !SEED_STAFF_MEMBERS.some((s) => s.id === staffId)) {
      try {
        await deleteDoc(doc(db, 'staffMembers', staffId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `staffMembers/${staffId}`);
      }
    }
    pushNotification('Staff Removed', 'Team member access revoked.', 'status');
  };

  // Salary Payment Save / Toggle Paid
  const handleSaveSalaryRecord = async (record: SalaryPayment) => {
    const cleaned = stripUndefined(record);
    setSalaryRecords((prev) => {
      const exists = prev.some((r) => r.id === cleaned.id);
      return exists ? prev.map((r) => (r.id === cleaned.id ? cleaned : r)) : [cleaned, ...prev];
    });
    if (isOwner) {
      const { id: _id, ...payload } = cleaned;
      try {
        await setDoc(doc(db, 'salaryRecords', cleaned.id), payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `salaryRecords/${cleaned.id}`);
      }
    }
    pushNotification(
      cleaned.status === 'paid' ? 'Salary Marked Paid' : 'Salary Updated',
      `${cleaned.targetName} · Net ${formatPkr(cleaned.netAmountPkr)} (${cleaned.status.toUpperCase()})`,
      'payment'
    );
  };

  // Business Owner Payout Save / Toggle Paid or Pending
  const handleSaveBusinessPayout = async (payout: BusinessPayout) => {
    const matchedBiz = restaurants.find((r) => r.id === payout.restaurantId);
    const cleaned = stripUndefined<BusinessPayout>({
      ...payout,
      ownerId: payout.ownerId || matchedBiz?.ownerId,
      ownerEmail: (payout.ownerEmail || matchedBiz?.ownerEmail)?.toLowerCase(),
    });
    setBusinessPayouts((prev) => {
      const exists = prev.some((r) => r.id === cleaned.id);
      return exists ? prev.map((r) => (r.id === cleaned.id ? cleaned : r)) : [cleaned, ...prev];
    });
    if (isOwner) {
      const { id: _id, ...payload } = cleaned;
      try {
        await setDoc(doc(db, 'businessPayouts', cleaned.id), payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `businessPayouts/${cleaned.id}`);
      }
    }
    pushNotification(
      cleaned.status === 'paid' ? 'Business Payout Marked Paid' : 'Business Payout Updated',
      `${cleaned.restaurantName} · Net ${formatPkr(cleaned.netPayablePkr)} (${cleaned.status.toUpperCase()})`,
      'payment'
    );
  };

  const deliveryRates = useMemo(() => resolveDeliveryRates(appSettings), [appSettings]);
  const businessCategories = useMemo(
    () => resolveBusinessCategories(appSettings),
    [appSettings]
  );
  const cancellationPolicies = useMemo(
    () => resolveCancellationPolicies(appSettings),
    [appSettings]
  );

  // App Settings Save (WhatsApp, Welcome Banner, Delivery Rates & Business Categories)
  const handleUpdateAppSettings = async (nextSettings: Partial<AppSettings>) => {
    const cleaned = stripUndefined<AppSettings>({
      ...appSettings,
      ...nextSettings,
      whatsappNumber:
        nextSettings.whatsappNumber ?? appSettings.whatsappNumber ?? DEFAULT_APP_SETTINGS.whatsappNumber,
      deletedBusinessIds: nextSettings.deletedBusinessIds ?? appSettings.deletedBusinessIds,
      businessCategories: nextSettings.businessCategories ?? appSettings.businessCategories,
      updatedAt: new Date().toISOString(),
    });
    setAppSettings(cleaned);
    try {
      window.localStorage.setItem('hsp_app_settings', JSON.stringify(cleaned));
    } catch {
      // ignore storage errors
    }
    if (isOwner) {
      try {
        await setDoc(doc(db, 'appSettings', 'public'), cleaned);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'appSettings/public');
      }
    }
    pushNotification(
      'App Settings Saved',
      'Live configuration (delivery rates, business categories & support settings) updated.',
      'status'
    );
  };

  // Rename an existing business category across AppSettings and matching businesses
  const handleRenameBusinessCategory = async (oldName: string, newName: string) => {
    const cleanOld = oldName.trim();
    const cleanNew = newName.trim();
    if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;
    const affected = restaurants.filter((r) => (r.businessType || 'Restaurant') === cleanOld);
    if (affected.length === 0) return;

    setRestaurants((prev) =>
      prev.map((r) =>
        (r.businessType || 'Restaurant') === cleanOld ? { ...r, businessType: cleanNew } : r
      )
    );

    if (isOwner) {
      await Promise.all(
        affected
          .filter((r) => !r.isSeed)
          .map(async (r) => {
            try {
              await updateDoc(doc(db, 'restaurants', r.id), { businessType: cleanNew });
            } catch (err) {
              console.warn(`Category rename sync info (${r.id}):`, err);
            }
          })
      );
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const completedOrdersCount = orders.filter((o) => o.status === 'delivered').length;
  const loyaltyTier = getLoyaltyTier(completedOrdersCount);
  const customerProfileName =
    user?.displayName ||
    sessionGrant.customerEmail?.split('@')[0] ||
    user?.email?.split('@')[0] ||
    'Guest Customer';

  // Effective role & strictly scoped navigation tabs per verified session grant
  const effectiveRole: UserRoleMode = useMemo(() => {
    if (sessionGrant.role === 'admin' && !isOwner) return 'customer';
    if (sessionGrant.role === 'staff' && !sessionGrant.staffMember) return 'customer';
    return sessionGrant.role;
  }, [sessionGrant, isOwner]);

  // Step 2: Live unanswered store orders that must keep ringing every 15s for the Business Owner (even minimized)
  // Excludes WhatsApp custom orders because Admin confirms those directly
  const pendingBusinessBellOrders = useMemo(() => {
    if (effectiveRole !== 'business' && effectiveRole !== 'admin') return [];
    return orders.filter((o) => {
      if (o.status !== 'placed' || o.id.startsWith('ord-demo-') || o.orderSource === 'whatsapp') {
        return false;
      }
      if (effectiveRole === 'business' && sessionGrant.businessId) {
        return o.restaurantId === sessionGrant.businessId;
      }
      return true;
    });
  }, [orders, effectiveRole, sessionGrant.businessId]);

  // Auto-focus shared ?waOrder=<id> link when opened by Admin/Staff or Customer
  useEffect(() => {
    if (!highlightedWaOrderId) return;
    if (effectiveRole === 'admin' || effectiveRole === 'staff') {
      setActiveTab('dashboard');
    } else if (orders.some((o) => o.id === highlightedWaOrderId)) {
      setSelectedOrderId(highlightedWaOrderId);
      setActiveTab('track');
    }
  }, [highlightedWaOrderId, effectiveRole, orders]);

  // Step 3: Business-accepted unassigned orders that must keep ringing every 15s for ALL Available Riders
  const pendingRiderBellOrders = useMemo(() => {
    if (effectiveRole !== 'rider' && effectiveRole !== 'admin' && effectiveRole !== 'staff') {
      return [];
    }
    if (effectiveRole === 'rider' && sessionGrant.riderId) {
      const me = riders.find((r) => r.id === sessionGrant.riderId);
      if (me && me.status === 'offline') return [];
    }
    return orders.filter(
      (o) =>
        !o.riderId &&
        (o.status === 'confirmed' || o.status === 'preparing') &&
        (!o.id.startsWith('ord-demo-') || Boolean(o.acceptedByBusinessAt) || o.id === broadcastOrderId)
    );
  }, [orders, riders, effectiveRole, sessionGrant.riderId, broadcastOrderId]);

  const pendingBusinessKey = pendingBusinessBellOrders.map((o) => o.id).join(',');
  const pendingRiderKey = pendingRiderBellOrders.map((o) => o.id).join(',');

  // Step 2 Background-Resilient 15-Second Repeating Bell for Business Owners
  useEffect(() => {
    if (!pendingBusinessKey) {
      setBusinessBellCountdown(null);
      if (!pendingRiderKey) {
        document.title = DEFAULT_DOCUMENT_TITLE;
        setPwaAppBadge(0);
      }
      return;
    }

    const lead = pendingBusinessBellOrders[0];
    if (!lead) return;

    const ringBusinessNow = () => {
      playBusinessOrderBell(soundMuted);
      showSystemNotification({
        title: `New Order ${lead.orderCode} · ${lead.restaurantName}`,
        body: `${lead.customerName} placed ${lead.items.reduce((s, i) => s + i.quantity, 0)} item(s) (${formatPkr(lead.totalPkr)}). Open HSP delivery to Accept or Reject.`,
        tag: `hsp-biz-bell-${lead.id}`,
        renotify: true,
        requireInteraction: true,
      });
    };

    ringBusinessNow();
    setBusinessBellCountdown(15);
    setPwaAppBadge(pendingBusinessBellOrders.length);
    document.title = `(${pendingBusinessBellOrders.length}) NEW ORDER! — HSP delivery`;

    const stopBgInterval = startBackgroundRepeatingInterval(15000, () => {
      ringBusinessNow();
      setBusinessBellCountdown(15);
    });

    const countdownTick = window.setInterval(() => {
      setBusinessBellCountdown((prev) => (prev === null ? 15 : prev <= 1 ? 15 : prev - 1));
    }, 1000);

    return () => {
      stopBgInterval();
      window.clearInterval(countdownTick);
      setBusinessBellCountdown(null);
    };
  }, [pendingBusinessKey, pendingRiderKey, soundMuted]);

  // Step 3 Background-Resilient 15-Second Repeating Dispatch Bell for All Available Riders
  useEffect(() => {
    if (!pendingRiderKey) {
      setRiderBellCountdown(null);
      if (!pendingBusinessKey) {
        document.title = DEFAULT_DOCUMENT_TITLE;
        setPwaAppBadge(0);
      }
      return;
    }

    const lead = pendingRiderBellOrders[0];
    if (!lead) return;

    const ringRiderNow = () => {
      playRiderDispatchBell(soundMuted);
      showSystemNotification({
        title: `Rider Dispatch ${lead.orderCode} · ${lead.restaurantName}`,
        body: `Store accepted! Pickup at ${lead.restaurantName} (${lead.city}) · ${formatPkr(lead.totalPkr)}. Tap to accept first.`,
        tag: `hsp-rider-bell-${lead.id}`,
        renotify: true,
        requireInteraction: true,
      });
    };

    ringRiderNow();
    setRiderBellCountdown(15);
    setPwaAppBadge(pendingRiderBellOrders.length + pendingBusinessBellOrders.length);
    if (!pendingBusinessKey) {
      document.title = `(${pendingRiderBellOrders.length}) RIDER DISPATCH! — HSP delivery`;
    }

    const stopBgInterval = startBackgroundRepeatingInterval(15000, () => {
      ringRiderNow();
      setRiderBellCountdown(15);
    });

    const countdownTick = window.setInterval(() => {
      setRiderBellCountdown((prev) => (prev === null ? 15 : prev <= 1 ? 15 : prev - 1));
    }, 1000);

    return () => {
      stopBgInterval();
      window.clearInterval(countdownTick);
      setRiderBellCountdown(null);
    };
  }, [pendingRiderKey, pendingBusinessKey, soundMuted]);

  const visibleTabs = useMemo(() => {
    const allTabs: Array<{
      id: AppTab;
      label: string;
      mobileLabel: string;
      Icon: typeof ShoppingBag;
    }> = [
      { id: 'order', label: t.navOrder, mobileLabel: 'Shop', Icon: ShoppingBag },
      { id: 'track', label: t.navTrack, mobileLabel: 'Track', Icon: MapPin },
      { id: 'restaurant', label: t.navRestaurant, mobileLabel: 'Business', Icon: Store },
      { id: 'rider', label: t.navRider, mobileLabel: 'Rider', Icon: Bike },
      { id: 'dashboard', label: t.navDashboard, mobileLabel: 'Admin', Icon: BarChart3 },
    ];

    if (effectiveRole === 'customer') {
      return allTabs.filter((tab) => tab.id === 'order' || tab.id === 'track');
    }
    if (effectiveRole === 'rider') {
      return allTabs.filter((tab) => tab.id === 'rider' || tab.id === 'track');
    }
    if (effectiveRole === 'business') {
      return allTabs.filter((tab) => tab.id === 'restaurant' || tab.id === 'track');
    }
    if (effectiveRole === 'staff') {
      return allTabs.filter((tab) => tab.id === 'dashboard' || tab.id === 'track');
    }
    return allTabs;
  }, [effectiveRole, t.navOrder, t.navTrack, t.navRestaurant, t.navRider, t.navDashboard]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  const handleSelectRole = (grant: RoleSessionGrant) => {
    if (grant.role === 'admin' && !isOwner) {
      if (!user) {
        signInWithGoogle();
      } else {
        pushNotification(
          'App Owner Account Restricted',
          'Only authorized App Owner accounts can open the App Owner dashboard.',
          'status'
        );
      }
      return;
    }

    setOpenBusinessRegisterForm(false);
    setSessionGrant(grant);
    try {
      window.localStorage.setItem(GRANT_STORAGE_KEY, JSON.stringify(grant));
    } catch {
      // ignore
    }

    if (grant.role === 'customer') setActiveTab('order');
    if (grant.role === 'rider') setActiveTab('rider');
    if (grant.role === 'business') setActiveTab('restaurant');
    if (grant.role === 'staff') setActiveTab('dashboard');
    if (grant.role === 'admin') setActiveTab('dashboard');

    setRoleModalOpen(false);
    pushNotification(
      `${ROLE_LABELS[grant.role]} Mode Active`,
      grant.loginId
        ? `Signed in with Owner-issued ID: ${grant.loginId}`
        : `Workspace tailored for ${ROLE_LABELS[grant.role]}.`,
      'status'
    );
  };

  return (
    <ErrorBoundary>
      <APIProvider apiKey={MAPS_API_KEY} language={language} region="PK">
        <AnimatePresence>
          {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
        </AnimatePresence>

        <div className="min-h-screen flex flex-col bg-[#07070A] text-white bg-[radial-gradient(ellipse_at_top_left,_rgba(245,158,11,0.12),_transparent_45%),radial-gradient(ellipse_at_top_right,_rgba(250,204,21,0.09),_transparent_45%)]">
          {/* Mandatory Demo Key Quota Banner */}
          {mapsQuotaExceeded && (
            <div className="bg-amber-950/90 border-b border-amber-500/40 text-amber-200 px-4 py-2.5 text-xs md:text-sm font-semibold text-center sticky top-0 z-50 shadow-sm">
              <span>
                Google Maps Platform quota reached. If you are the app owner, visit{' '}
                <a
                  href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-bold text-amber-300 hover:text-amber-200"
                >
                  maps developer site
                </a>{' '}
                for instructions to update your account.
              </span>
            </div>
          )}

          {/* Flagship Black & Gold Top Navigation Bar */}
          <header className="sticky top-0 z-30 bg-[#0B0B10]/95 backdrop-blur-xl border-b border-amber-500/25 shadow-[0_10px_35px_rgba(0,0,0,0.65)] no-print">
            <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500" />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 space-y-2.5">
              {/* Row 1: Brand (HSP delivery) + Scoped Role Menu + Always-on-top Download App & Sign In */}
              <div className="flex items-center justify-between gap-3">
                {/* Zone 1: Brand Logo & Wordmark */}
                <button
                  type="button"
                  onClick={() => handleSwitchTab(visibleTabs[0].id)}
                  className="inline-flex items-center gap-2.5 text-xl sm:text-2xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 font-display group"
                >
                  <img
                    src="/pwa-192x192.png"
                    alt="HSP delivery logo"
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-xl object-cover border border-amber-400/60 shadow-sm group-hover:scale-105 transition-transform"
                  />
                  <span>
                    HSP{' '}
                    <span className="bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-300 bg-clip-text text-transparent">
                      delivery
                    </span>
                  </span>
                </button>

                {/* Zone 2: Focused Role Navigation Menu */}
                <nav className="hidden lg:flex items-center gap-1 bg-zinc-900/90 p-1 rounded-2xl border border-zinc-800">
                  {visibleTabs.map(({ id, label, Icon }) => {
                    const active = activeTab === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleSwitchTab(id)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-display font-bold transition-all whitespace-nowrap shrink-0 ${
                          active
                            ? 'btn-shimmer bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 shadow-sm shadow-amber-500/25'
                            : 'text-zinc-300 hover:text-yellow-300 hover:bg-zinc-800/80'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </button>
                    );
                  })}
                </nav>

                {/* Zone 3: Always-On-Top Download App + Sign In / Sign Out */}
                <div className="flex items-center gap-2 shrink-0">
                  <PWAInstallButton
                    onInstalledRolePrompt={() => {
                      setRolePromptReason('Select Your Account Role');
                      setRoleModalOpen(true);
                    }}
                  />

                  {user ? (
                    <button
                      type="button"
                      onClick={() => signOutUser()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold hover:border-amber-400 transition-colors whitespace-nowrap shrink-0"
                    >
                      <LogOut className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="hidden sm:inline">{t.signOut}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => signInWithGoogle()}
                      className="btn-shimmer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 transition-all shadow-sm shadow-amber-500/25 whitespace-nowrap shrink-0"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      {t.signIn}
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: Always-On-Top Global Search Bar (Customer & App Owner) */}
              {(effectiveRole === 'customer' || effectiveRole === 'admin') && (
                <div className="relative">
                  <Search className="w-4 h-4 text-yellow-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={globalSearchQuery}
                    onChange={(e) => {
                      setGlobalSearchQuery(e.target.value);
                      if (activeTab !== 'order') setActiveTab('order');
                    }}
                    placeholder={t.searchPlaceholder}
                    className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-zinc-900/95 border border-zinc-700/90 text-white placeholder:text-zinc-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40 transition-all"
                  />
                  {globalSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setGlobalSearchQuery('')}
                      aria-label="Clear search"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-yellow-300 p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </header>

          {/* Compact Workspace Utility Bar */}
          <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4 pb-2 flex flex-wrap items-center justify-between gap-3 no-print">
            <div className="text-xs font-semibold text-zinc-400 flex flex-wrap items-center gap-2">
              <span className="text-yellow-400 font-bold inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {selectedCity.name}, Pakistan
              </span>
              <span aria-hidden="true" className="text-zinc-700">·</span>
              <span className="font-mono-tabular text-zinc-300">PKR (Rs.)</span>
              <span aria-hidden="true" className="text-zinc-700">·</span>
              <span className="inline-flex items-center gap-2">
                <span className="text-white font-bold truncate max-w-[180px]">
                  {customerProfileName}
                </span>
                {(effectiveRole === 'customer' || effectiveRole === 'admin') && (
                  <LoyaltyBadge tier={loyaltyTier} completedOrders={completedOrdersCount} />
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setRolePromptReason('Switch Account Role & Login ID');
                  setRoleModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-amber-500/40 text-xs font-bold text-yellow-300 hover:border-yellow-400 hover:text-yellow-200 transition-colors whitespace-nowrap"
              >
                <UserCheck className="w-3.5 h-3.5 text-yellow-400" />
                Role: {ROLE_LABELS[effectiveRole]}
                {sessionGrant.loginId ? ` (${sessionGrant.loginId})` : ''}
              </button>

              <button
                type="button"
                onClick={() => setLanguage((l) => (l === 'en' ? 'ur' : 'en'))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-200 hover:border-amber-400/50 hover:text-yellow-300 transition-colors whitespace-nowrap"
              >
                <Globe className="w-3.5 h-3.5 text-yellow-400" />
                {language === 'en' ? 'اردو' : 'English'}
              </button>

              <button
                type="button"
                onClick={() => setSoundMuted((m) => !m)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-200 hover:border-amber-400/50 hover:text-yellow-300 transition-colors whitespace-nowrap"
                title="Toggle order received sound"
              >
                {soundMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span className="hidden sm:inline">{soundMuted ? 'Muted' : 'Sound On'}</span>
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotificationsOpen((v) => !v);
                    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-200 hover:border-amber-400/50 hover:text-yellow-300 transition-colors whitespace-nowrap"
                >
                  <Bell className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Alerts</span>
                  {unreadCount > 0 && (
                    <span className="font-mono-tabular font-bold text-yellow-400">
                      ({unreadCount})
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-[#0E0E14] border border-amber-500/35 rounded-2xl shadow-2xl z-40 overflow-hidden">
                    <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90">
                      <span className="text-xs font-bold text-white">Push Notifications</span>
                      <button
                        type="button"
                        onClick={() => playOrderReceivedSound(false)}
                        className="text-[11px] font-bold text-yellow-400 hover:underline"
                      >
                        Test Order Sound
                      </button>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-zinc-800">
                      {notifications.map((n) => (
                        <div key={n.id} className="p-3.5 space-y-0.5 hover:bg-zinc-900/50">
                          <p className="text-xs font-bold text-yellow-300">{n.title}</p>
                          <p className="text-xs font-medium text-zinc-300">{n.body}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => openPolicyModal('privacy')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-emerald-500/35 text-xs font-bold text-emerald-300 hover:border-emerald-400 hover:bg-emerald-500/10 transition-colors whitespace-nowrap"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Privacy Policy
              </button>

              <button
                type="button"
                onClick={() => setSupportOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-xs font-bold text-yellow-300 hover:bg-amber-500/25 transition-colors whitespace-nowrap"
              >
                <Headphones className="w-3.5 h-3.5 text-yellow-400" />
                {t.supportChat}
              </button>
            </div>
          </div>

          {/* Highly Visible Back-to-Menu Bar whenever user is on a secondary tab */}
          {visibleTabs.length > 1 && activeTab !== visibleTabs[0].id && (
            <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pb-2 no-print">
              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl bg-[#0E0E14] border border-amber-500/40 shadow-md">
                <button
                  type="button"
                  onClick={() => handleSwitchTab(visibleTabs[0].id)}
                  className="btn-shimmer group inline-flex items-center gap-2 px-4 py-2 min-h-[42px] rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-400 text-zinc-950 text-xs sm:text-sm font-extrabold shadow-sm shadow-amber-500/25 hover:brightness-105"
                >
                  <ArrowLeft className="w-4 h-4 stroke-[2.8] transition-transform duration-150 group-hover:-translate-x-1" />
                  <span>Back to {visibleTabs[0].label}</span>
                </button>
                <span className="text-xs font-bold text-zinc-400 truncate">
                  Current:{' '}
                  <span className="text-yellow-300 font-extrabold">
                    {visibleTabs.find((tItem) => tItem.id === activeTab)?.label || 'View'}
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* Background Notification & 15s Repeating Bell Permission Bar */}
          {notifPermission === 'default' && !dismissedNotifBanner && (
            <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pb-2 no-print">
              <div className="px-4 py-2.5 rounded-xl bg-amber-500/12 border border-amber-400/40 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-amber-200 font-semibold">
                  <BellRing className="w-4 h-4 text-yellow-400 shrink-0" />
                  <span>
                    Enable background alerts so order notifications &amp; 15-second repeating bells keep ringing even when the app is minimized.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleEnableBackgroundAlerts}
                    className="btn-shimmer px-3.5 py-1.5 min-h-[36px] rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 transition-all"
                  >
                    Enable Background Alerts
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissedNotifBanner(true)}
                    className="p-1.5 text-zinc-400 hover:text-white"
                    aria-label="Dismiss alert prompt"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Main Content Workspace (Code-Split via Suspense for fast load) */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
            <Suspense
              fallback={
                <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
                  <div className="w-8 h-8 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin" />
                  <p className="text-xs font-semibold tracking-wide">Loading workspace...</p>
                </div>
              }
            >
              {activeTab === 'order' && (
                <CustomerMarketplace
                  language={language}
                  selectedCity={selectedCity}
                  onSelectCity={setSelectedCity}
                  restaurants={restaurants}
                  menuItems={menuItems}
                  reviews={reviews}
                  orders={orders}
                  cartItems={cartItems}
                  cartRestaurantId={cartRestaurantId}
                  searchQuery={globalSearchQuery}
                  showWhatsAppButton={effectiveRole === 'customer'}
                  whatsappNumber={appSettings.whatsappNumber}
                  onOpenWhatsAppOrder={() => setWhatsappOrderModalOpen(true)}
                  welcomeTitle={appSettings.welcomeTitle}
                  welcomeSubtitle={appSettings.welcomeSubtitle}
                  deliveryRates={deliveryRates}
                  businessCategories={businessCategories}
                  onSearchQueryChange={setGlobalSearchQuery}
                  onAddToCart={handleAddToCart}
                  onOpenCheckout={() => setCheckoutOpen(true)}
                  onSubmitReview={handleSubmitReview}
                  onOpenRestaurantPortal={() => {
                    if (effectiveRole === 'customer') {
                      setRolePromptReason('Sign in with Business ID or Submit Store Registration');
                      setRoleModalOpen(true);
                    } else {
                      setActiveTab('restaurant');
                    }
                  }}
                  customerName={customerProfileName}
                  loyaltyTier={loyaltyTier}
                  completedOrdersCount={completedOrdersCount}
                  onReorder={handleReorderPastOrder}
                  onTrackOrder={(orderId) => {
                    setSelectedOrderId(orderId);
                    setActiveTab('track');
                  }}
                />
              )}

              {activeTab === 'track' && (
                <LiveTrackingView
                  orders={orders}
                  selectedOrderId={selectedOrderId}
                  canAdvanceStatus={effectiveRole !== 'customer'}
                  cancellationPolicies={cancellationPolicies}
                  onSelectOrder={setSelectedOrderId}
                  onAdvanceOrderStatus={handleAdvanceOrderStatus}
                  onRateDriver={handleRateDriver}
                  onCancelOrder={handleCustomerCancelOrder}
                  onOpenPolicy={() => openPolicyModal('customer')}
                  onOpenSupport={() => setSupportOpen(true)}
                  onReorder={handleReorderPastOrder}
                />
              )}

              {activeTab === 'restaurant' && (
                <RestaurantPortal
                  restaurants={restaurants}
                  menuItems={menuItems}
                  orders={orders}
                  businessPayouts={businessPayouts}
                  businessCategories={businessCategories}
                  cancellationPolicies={cancellationPolicies}
                  onOpenPolicy={() => openPolicyModal('business')}
                  isAdmin={isOwner}
                  lockedBusinessId={effectiveRole === 'business' ? sessionGrant.businessId : null}
                  defaultOpenRegisterForm={openBusinessRegisterForm}
                  soundMuted={soundMuted}
                  businessBellCountdown={businessBellCountdown}
                  onToggleMute={() => setSoundMuted((m) => !m)}
                  onAcceptOrderByBusiness={handleBusinessAcceptOrder}
                  onRejectOrderByBusiness={handleBusinessRejectOrder}
                  onUpdateOrderStatus={handleUpdateOrderStatus}
                  onAddMenuItem={handleAddMenuItem}
                  onUpdateMenuItem={handleUpdateMenuItem}
                  onAddRestaurant={handleAddRestaurant}
                  onUpdateBusinessDetails={handleUpdateBusinessDetails}
                />
              )}

              {activeTab === 'rider' && (
                <RiderNavigationView
                  orders={orders}
                  riders={riders}
                  restaurants={restaurants}
                  deliveryRates={deliveryRates}
                  selectedOrderId={selectedOrderId}
                  lockedRiderId={effectiveRole === 'rider' ? sessionGrant.riderId : null}
                  riderBellCountdown={riderBellCountdown}
                  onAcceptOrder={handleAcceptOrderByRider}
                  onUpdateRiderLocation={handleUpdateRiderLocation}
                  onUpdateOrderDistance={handleUpdateOrderDistance}
                  onUpdateOrderStatus={handleUpdateOrderStatus}
                  onCompleteDeliveryWithProof={handleCompleteDeliveryWithProof}
                  onMarkPaidToOffice={handleMarkPaidToOffice}
                  onMarkWhatsAppAmountAlreadyPaid={handleMarkWhatsAppAmountAlreadyPaid}
                />
              )}

              {activeTab === 'dashboard' && (isOwner || effectiveRole === 'staff') && (
                <OperationsDashboard
                  orders={orders}
                  riders={riders}
                  restaurants={restaurants}
                  menuItems={menuItems}
                  staffMembers={staffMembers}
                  salaryRecords={salaryRecords}
                  businessPayouts={businessPayouts}
                  appSettings={appSettings}
                  isOwner={isOwner}
                  activeStaffMember={effectiveRole === 'staff' ? sessionGrant.staffMember : null}
                  highlightedWaOrderId={highlightedWaOrderId}
                  onClearHighlightedWaOrder={() => {
                    setHighlightedWaOrderId(null);
                    try {
                      const url = new URL(window.location.href);
                      url.searchParams.delete('waOrder');
                      window.history.replaceState({}, '', url.toString());
                    } catch {
                      // ignore history errors
                    }
                  }}
                  onConfirmWhatsAppOrder={handleConfirmWhatsAppOrder}
                  onRejectWhatsAppOrder={handleBusinessRejectOrder}
                  onAddRider={handleAddRider}
                  onUpdateRiderStatus={handleUpdateRiderStatus}
                  onUpdateRiderCompensation={handleUpdateRiderCompensation}
                  onUpdateRiderDetails={handleUpdateRiderDetails}
                  onDeleteRider={handleDeleteRider}
                  onAssignRiderToOrder={handleAssignRiderToOrder}
                  onUpdateOrderRiderEarning={handleUpdateOrderRiderEarning}
                  onUpdateOrderPayment={handleUpdateOrderPayment}
                  onUpdateBusinessApproval={handleUpdateBusinessApproval}
                  onAssignBusinessLoginId={handleAssignBusinessLoginId}
                  onUpdateBusinessDetails={handleUpdateBusinessDetails}
                  onDeleteBusiness={handleDeleteBusiness}
                  onUpdateMenuItem={handleUpdateMenuItem}
                  onAddStaffMember={handleAddStaffMember}
                  onUpdateStaffDetails={handleUpdateStaffDetails}
                  onUpdateStaffPermissions={handleUpdateStaffPermissions}
                  onToggleStaffActive={handleToggleStaffActive}
                  onDeleteStaffMember={handleDeleteStaffMember}
                  onSaveSalaryRecord={handleSaveSalaryRecord}
                  onSaveBusinessPayout={handleSaveBusinessPayout}
                  onUpdateAppSettings={handleUpdateAppSettings}
                  onRenameBusinessCategory={handleRenameBusinessCategory}
                  onOpenPolicyPreview={openPolicyModal}
                  deliveryProofs={deliveryProofs}
                  onLoadDeliveryProof={handleLoadDeliveryProof}
                />
              )}
            </Suspense>
            </motion.div>
          </main>

          {/* Direct App Download QR Code Section at End of App */}
          <QRDownloadFooter
            onOpenRoleSetup={() => {
              setRolePromptReason('Select Your Account Role & Login ID');
              setRoleModalOpen(true);
            }}
            onOpenPolicy={openPolicyModal}
          />

          {/* Clean Black & Gold Fixed Bottom Tab Navigation (Mobile / Tablet, Scoped by Role) */}
          <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B0B10]/95 backdrop-blur-xl border-t border-amber-500/25 shadow-[0_-8px_25px_rgba(0,0,0,0.45)] pb-safe no-print">
            <div
              className={`grid h-16 items-center ${
                visibleTabs.length === 2
                  ? 'grid-cols-2'
                  : visibleTabs.length === 3
                    ? 'grid-cols-3'
                    : visibleTabs.length === 4
                      ? 'grid-cols-4'
                      : 'grid-cols-5'
              }`}
            >
              {visibleTabs.map(({ id, mobileLabel, Icon }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleSwitchTab(id)}
                    className={`relative flex flex-col items-center justify-center min-h-[48px] transition-colors ${
                      active ? 'text-yellow-400' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="mobileBottomTabIndicator"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-300"
                      />
                    )}
                    <Icon
                      className={`w-5 h-5 transition-transform duration-150 ${
                        active ? 'scale-110' : 'scale-100'
                      }`}
                    />
                    <span className="text-[11px] font-display font-bold mt-1 truncate max-w-[72px]">
                      {mobileLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Step 2: Urgent Repeating 15s Business Owner Incoming Order Overlay (Business / Admin Role) */}
          {pendingBusinessBellOrders.length > 0 &&
            (() => {
              const incomingOrder = pendingBusinessBellOrders[0];
              const itemCount = incomingOrder.items.reduce((s, i) => s + i.quantity, 0);
              const isRejectOpen = overlayRejectOrderId === incomingOrder.id;

              return (
                <div className="fixed bottom-20 md:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-[430px] z-50 bg-[#0E0E14] text-white p-5 rounded-2xl shadow-2xl border-2 border-yellow-400 space-y-3.5 no-print">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-400 text-zinc-950 flex items-center justify-center shrink-0 shadow-sm">
                        <BellRing className="w-5 h-5 stroke-[2.5] animate-bounce" />
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-yellow-400">
                          Business Alert · Ringing Every 15s
                          {businessBellCountdown !== null ? ` (${businessBellCountdown}s)` : ''}
                        </p>
                        <p className="text-sm font-extrabold text-white">
                          New Order {incomingOrder.orderCode} · {formatPkr(incomingOrder.totalPkr)}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono-tabular text-[11px] font-bold text-amber-300 shrink-0">
                      {pendingBusinessBellOrders.length} waiting
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1 text-xs">
                    <p className="font-extrabold text-white">{incomingOrder.restaurantName}</p>
                    <p className="font-semibold text-zinc-300">
                      {incomingOrder.customerName} · {itemCount} {itemCount === 1 ? 'item' : 'items'} ·{' '}
                      {incomingOrder.paymentMethod}
                    </p>
                    <p className="text-zinc-400 truncate">
                      {incomingOrder.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                    </p>
                  </div>

                  {isRejectOpen ? (
                    <div className="p-3 rounded-xl bg-rose-500/12 border border-rose-500/45 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-rose-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Rejection Reason (Required for Customer)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setOverlayRejectOrderId(null);
                            setOverlayRejectReason('');
                            setOverlayRejectError('');
                          }}
                          className="text-zinc-400 hover:text-white p-1"
                          aria-label="Cancel reject"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_REJECTION_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              setOverlayRejectReason(preset);
                              setOverlayRejectError('');
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                              overlayRejectReason === preset
                                ? 'bg-rose-500 text-white border-rose-300'
                                : 'bg-zinc-950 text-zinc-200 border-zinc-700 hover:border-rose-400'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <textarea
                        rows={2}
                        maxLength={280}
                        value={overlayRejectReason}
                        onChange={(e) => {
                          setOverlayRejectReason(e.target.value);
                          setOverlayRejectError('');
                        }}
                        placeholder="Write reason for customer..."
                        className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-zinc-950 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-rose-400"
                      />
                      {overlayRejectError && (
                        <p className="text-[11px] font-bold text-rose-300">{overlayRejectError}</p>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          const clean = overlayRejectReason.trim();
                          if (clean.length < 3) {
                            setOverlayRejectError('Please select or write a reason (at least 3 characters).');
                            return;
                          }
                          await handleBusinessRejectOrder(incomingOrder.id, clean);
                          setOverlayRejectOrderId(null);
                          setOverlayRejectReason('');
                          setOverlayRejectError('');
                        }}
                        className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-extrabold transition-colors"
                      >
                        Confirm Reject &amp; Send Reason to Customer
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleBusinessAcceptOrder(incomingOrder.id)}
                        className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 inline-flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20"
                      >
                        <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                        Accept &amp; Alert Riders
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOverlayRejectOrderId(incomingOrder.id);
                          setOverlayRejectReason('');
                          setOverlayRejectError('');
                        }}
                        className="min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/45 text-rose-300 text-xs font-extrabold hover:bg-rose-500 hover:text-white transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

          {/* Step 3: Interactive 15s Repeating Rider Broadcast Notification (Only AFTER Business Accepts) */}
          {pendingBusinessBellOrders.length === 0 &&
            pendingRiderBellOrders.length > 0 &&
            (() => {
              const pendingOrder = pendingRiderBellOrders[0];
              if (!pendingOrder) return null;
              const pickupRest = restaurants.find((r) => r.id === pendingOrder.restaurantId);
              const availablePool = riders.filter((r) => r.status === 'available');
              const poolToShow = availablePool.length > 0 ? availablePool : riders;
              const chosenRider =
                (effectiveRole === 'rider' && sessionGrant.riderId
                  ? riders.find((r) => r.id === sessionGrant.riderId)
                  : undefined) ||
                poolToShow.find((r) => r.id === broadcastRiderId) ||
                poolToShow[0];
              const itemCount = pendingOrder.items.reduce((s, i) => s + i.quantity, 0);

              return (
                <div className="fixed bottom-20 md:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-[420px] z-50 bg-[#0E0E14] text-white p-5 rounded-2xl shadow-2xl border-2 border-amber-400/75 space-y-3.5 no-print">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-400 text-zinc-950 flex items-center justify-center shrink-0 shadow-sm">
                        <BellRing className="w-4 h-4 stroke-[2.5] animate-bounce" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-yellow-400">
                          Rider Dispatch · Ringing Every 15s
                          {riderBellCountdown !== null ? ` (${riderBellCountdown}s)` : ''} ·{' '}
                          {Math.max(1, availablePool.length)} Available Riders
                        </p>
                        <p className="text-sm font-bold text-white">
                          Store Accepted {pendingOrder.orderCode} ({itemCount}{' '}
                          {itemCount === 1 ? 'item' : 'items'}) · {formatPkr(pendingOrder.totalPkr)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1.5 text-xs">
                    <div className="flex items-start gap-2">
                      <Store className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                      <p className="font-bold text-white">{pendingOrder.restaurantName}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <p className="font-medium text-zinc-300">
                        Pickup: {pickupRest?.address || `${pendingOrder.restaurantName}, ${pendingOrder.city}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 pt-1">
                      <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                      Accept to notify customer &amp; store and unlock drop-off details
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    {!(effectiveRole === 'rider' && sessionGrant.riderId) && (
                      <select
                        value={chosenRider?.id || ''}
                        onChange={(e) => setBroadcastRiderId(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs font-semibold rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-amber-400"
                      >
                        {poolToShow.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.city} · {r.vehiclePlate})
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => chosenRider && handleAcceptOrderByRider(pendingOrder.id, chosenRider)}
                      className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shadow-md shadow-amber-500/20"
                    >
                      <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                      Accept Order
                    </button>
                  </div>
                </div>
              );
            })()}

          {/* Automated Push Notification Toast */}
          {activeToast && (
            <div className="fixed top-20 right-4 left-4 sm:left-auto sm:w-96 z-50 bg-[#0E0E14] text-white p-4 rounded-2xl shadow-2xl border border-amber-500/45 flex items-start gap-3 no-print">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-400 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-zinc-950" />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-xs font-extrabold text-yellow-300">{activeToast.title}</p>
                <p className="text-xs font-medium text-zinc-300 leading-snug">
                  {activeToast.body}
                </p>
                {activeToast.actionLabel && activeToast.onAction && (
                  <button
                    type="button"
                    onClick={() => {
                      activeToast.onAction?.();
                      setActiveToast(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-[11px] font-extrabold hover:brightness-105 transition-all"
                  >
                    <MapPin className="w-3 h-3 stroke-[2.5]" />
                    {activeToast.actionLabel}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActiveToast(null)}
                className="text-zinc-400 hover:text-yellow-300 p-1"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Checkout & Support Drawers (Lazy Mounted When Open) */}
          <Suspense fallback={null}>
            {checkoutOpen && (
              <CheckoutDrawer
                open={checkoutOpen}
                onClose={() => setCheckoutOpen(false)}
                restaurant={cartRestaurant}
                items={cartItems}
                cityConfig={selectedCity}
                defaultCustomerName={customerProfileName}
                loyaltyTier={loyaltyTier}
                completedOrdersCount={completedOrdersCount}
                deliveryRates={deliveryRates}
                cancellationPolicies={cancellationPolicies}
                onOpenPolicy={() => openPolicyModal('customer')}
                onUpdateQty={handleUpdateCartQty}
                onClearCart={handleClearCart}
                onPlaceOrder={handlePlaceOrder}
              />
            )}

            {supportOpen && (
              <SupportChatDrawer
                open={supportOpen}
                onClose={() => setSupportOpen(false)}
                messages={supportMessages}
                activeOrderCode={orders[0]?.orderCode}
                onSendMessage={handleSendSupportMessage}
              />
            )}

            {whatsappOrderModalOpen && (
              <WhatsAppOrderModal
                open={whatsappOrderModalOpen}
                selectedCity={selectedCity}
                whatsappNumber={appSettings.whatsappNumber}
                defaultCustomerName={customerProfileName}
                deliveryRates={deliveryRates}
                cancellationPolicies={cancellationPolicies}
                onOpenPolicy={() => openPolicyModal('customer')}
                onClose={() => setWhatsappOrderModalOpen(false)}
                onSubmitWhatsAppOrder={handleCreateWhatsAppOrder}
                onTrackOrder={(orderId) => {
                  setSelectedOrderId(orderId);
                  setActiveTab('track');
                }}
              />
            )}
          </Suspense>

          {/* Order Cancellation & Platform Policies Modal (Customer, Business Owner & Privacy) */}
          <CancellationPolicyModal
            open={policyModalOpen}
            initialTab={policyModalTab}
            policies={cancellationPolicies}
            whatsappNumber={appSettings.whatsappNumber}
            supportEmail={appSettings.playSupportEmail}
            onClose={() => setPolicyModalOpen(false)}
          />

          {/* Role Selection / Login ID Onboarding Modal */}
          <RoleAccessModal
            open={roleModalOpen}
            currentRole={effectiveRole}
            isOwnerUser={isOwner}
            userEmail={user?.email || sessionGrant.customerEmail}
            riders={riders}
            restaurants={restaurants}
            staffMembers={staffMembers}
            welcomeTitle={appSettings.welcomeTitle}
            welcomeSubtitle={appSettings.welcomeSubtitle}
            reasonLabel={rolePromptReason}
            onSelectRole={handleSelectRole}
            onOpenBusinessRegister={() => {
              setOpenBusinessRegisterForm(true);
              setSessionGrant({ role: 'business' });
              setActiveTab('restaurant');
              setRoleModalOpen(false);
            }}
            onRequestGoogleSignIn={() => signInWithGoogle()}
            onClose={() => setRoleModalOpen(false)}
          />

          <OfflineIndicator />
        </div>
      </APIProvider>
    </ErrorBoundary>
  );
}
