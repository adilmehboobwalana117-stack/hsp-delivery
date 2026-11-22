import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Banknote,
  Bike,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  ImagePlus,
  KeyRound,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Plus,
  Printer,
  RotateCcw,
  Route,
  Save,
  Search,
  ShieldCheck,
  Star,
  Store,
  Tag,
  Trash2,
  TrendingUp,
  UserCog,
  UserPlus,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { DateRangePicker, formatDateRangeLabel } from './DateRangePicker';
import {
  AppSettings,
  BusinessApprovalStatus,
  BusinessPayout,
  BusinessType,
  DeliveryProofRecord,
  MenuItem,
  MenuItemVariety,
  Order,
  PaymentMethod,
  PaymentStatus,
  Restaurant,
  Rider,
  RiderStatus,
  RiderVehicleType,
  SalaryPayment,
  StaffMember,
  StaffPermissions,
} from '../types';
import {
  BUSINESS_TYPES,
  FOOD_IMAGES,
  PAKISTAN_CITIES,
  formatPkr,
  getSeedRiderMonthlyEarnings,
  resolveBusinessCategories,
} from '../data/pakistanData';
import {
  DEFAULT_DELIVERY_RATES,
  calculateCustomerDeliveryFeePkr,
  calculateRiderDeliveryEarningPkr,
  calculateRoadDistanceKm,
  formatRiderRateSummary,
  resolveDeliveryRates,
} from '../utils/pricing';
import { downloadCsv, triggerPrintWithTitle } from '../utils/exportPrint';
import { compressFoodImage } from '../utils/sound';
import { formatTimeRange } from '../utils/storeHours';
import { FoodImage } from './FoodImage';
import { AdminPoliciesPanel } from './AdminPoliciesPanel';
import { PlayConsolePublishingPanel } from './PlayConsolePublishingPanel';
import { PolicyModalTab } from './CancellationPolicyModal';
import { DeliveryProofModal } from './DeliveryProofModal';

interface OperationsDashboardProps {
  orders: Order[];
  riders: Rider[];
  restaurants: Restaurant[];
  menuItems: MenuItem[];
  staffMembers: StaffMember[];
  salaryRecords: SalaryPayment[];
  businessPayouts: BusinessPayout[];
  appSettings: AppSettings;
  isOwner: boolean;
  activeStaffMember?: StaffMember | null;
  onAddRider: (payload: {
    name: string;
    email?: string;
    phone: string;
    cnic?: string;
    city: string;
    vehicleType: RiderVehicleType;
    vehiclePlate: string;
    loginId: string;
    monthlySalaryPkr: number;
  }) => Promise<void>;
  onUpdateRiderStatus: (riderId: string, status: RiderStatus) => Promise<void>;
  onUpdateRiderCompensation: (
    riderId: string,
    updates: { monthlySalaryPkr?: number; walletBonusPkr?: number; loginId?: string }
  ) => Promise<void>;
  onUpdateRiderDetails: (riderId: string, updates: Partial<Rider>) => Promise<void>;
  onDeleteRider: (riderId: string) => Promise<void>;
  onAssignRiderToOrder: (orderId: string, rider: Rider) => Promise<void>;
  onUpdateOrderRiderEarning: (orderId: string, riderEarningPkr: number) => Promise<void>;
  onUpdateOrderPayment: (
    orderId: string,
    updates: {
      paymentMethod?: PaymentMethod;
      paymentStatus?: PaymentStatus;
      paymentRef?: string;
      officeSettled?: boolean;
    }
  ) => Promise<void>;
  onUpdateBusinessApproval: (
    restaurantId: string,
    status: 'approved' | 'rejected',
    businessLoginId?: string
  ) => Promise<void>;
  onAssignBusinessLoginId: (restaurantId: string, businessLoginId: string) => Promise<void>;
  onUpdateBusinessDetails: (restaurantId: string, updates: Partial<Restaurant>) => Promise<void>;
  onDeleteBusiness: (restaurantId: string) => Promise<void>;
  onUpdateMenuItem: (itemId: string, updates: Partial<MenuItem>) => Promise<void>;
  onAddStaffMember: (payload: {
    name: string;
    role: 'manager' | 'staff';
    email?: string;
    phone: string;
    city: string;
    loginId: string;
    monthlySalaryPkr: number;
    permissions: StaffPermissions;
  }) => Promise<void>;
  onUpdateStaffDetails: (staffId: string, updates: Partial<StaffMember>) => Promise<void>;
  onUpdateStaffPermissions: (staffId: string, permissions: StaffPermissions) => Promise<void>;
  onToggleStaffActive: (staffId: string, active: boolean) => Promise<void>;
  onDeleteStaffMember: (staffId: string) => Promise<void>;
  onSaveSalaryRecord: (record: SalaryPayment) => Promise<void>;
  onSaveBusinessPayout: (payout: BusinessPayout) => Promise<void>;
  onUpdateAppSettings: (settings: Partial<AppSettings>) => Promise<void>;
  onRenameBusinessCategory?: (oldName: string, newName: string) => Promise<void>;
  onOpenPolicyPreview?: (tab: PolicyModalTab) => void;
  highlightedWaOrderId?: string | null;
  onClearHighlightedWaOrder?: () => void;
  onConfirmWhatsAppOrder?: (orderId: string, itemPricePkr?: number) => Promise<void>;
  onRejectWhatsAppOrder?: (orderId: string, reason: string) => Promise<void>;
  deliveryProofs?: Record<string, DeliveryProofRecord>;
  onLoadDeliveryProof?: (orderId: string) => Promise<DeliveryProofRecord | null>;
}

type DashSection =
  | 'overview'
  | 'payments'
  | 'approvals'
  | 'rates'
  | 'policies'
  | 'publishing'
  | 'fleet'
  | 'salary'
  | 'staff'
  | 'catalog';

const CATALOG_PRESETS = [
  { label: 'Karahi', url: FOOD_IMAGES.chickenKarahi },
  { label: 'Biryani', url: FOOD_IMAGES.sindhiBiryani },
  { label: 'Grocery', url: FOOD_IMAGES.groceryMart },
  { label: 'Pharmacy', url: FOOD_IMAGES.pharmacyCare },
  { label: 'Bakery', url: FOOD_IMAGES.bakerySweets },
  { label: 'Tech', url: FOOD_IMAGES.electronicsHub },
];

const PERMISSION_LABELS: Array<{ key: keyof StaffPermissions; label: string }> = [
  { key: 'canApproveBusinesses', label: 'Approve Businesses & Assign IDs' },
  { key: 'canManageRiders', label: 'Manage Rider Fleet' },
  { key: 'canEditRiderEarnings', label: 'Edit Rider Earnings & Bonuses' },
  { key: 'canManageSalaries', label: 'Manage Salaries & Payroll' },
  { key: 'canManageOrders', label: 'Dispatch & Manage Orders' },
  { key: 'canViewAnalytics', label: 'View Revenue & Analytics' },
];

export function OperationsDashboard({
  orders,
  riders,
  restaurants,
  menuItems,
  staffMembers,
  salaryRecords,
  businessPayouts,
  appSettings,
  isOwner,
  activeStaffMember,
  onAddRider,
  onUpdateRiderStatus,
  onUpdateRiderCompensation,
  onUpdateRiderDetails,
  onDeleteRider,
  onAssignRiderToOrder,
  onUpdateOrderRiderEarning,
  onUpdateOrderPayment,
  onUpdateBusinessApproval,
  onAssignBusinessLoginId,
  onUpdateBusinessDetails,
  onDeleteBusiness,
  onUpdateMenuItem,
  onAddStaffMember,
  onUpdateStaffDetails,
  onUpdateStaffPermissions,
  onToggleStaffActive,
  onDeleteStaffMember,
  onSaveSalaryRecord,
  onSaveBusinessPayout,
  onUpdateAppSettings,
  onRenameBusinessCategory,
  onOpenPolicyPreview,
  highlightedWaOrderId = null,
  onClearHighlightedWaOrder,
  onConfirmWhatsAppOrder,
  onRejectWhatsAppOrder,
  deliveryProofs,
  onLoadDeliveryProof,
}: OperationsDashboardProps) {
  const liveDeliveryRates = useMemo(() => resolveDeliveryRates(appSettings), [appSettings]);
  const liveBusinessCategories = useMemo(
    () => resolveBusinessCategories(appSettings),
    [appSettings]
  );
  const perms: StaffPermissions = useMemo(() => {
    if (isOwner) {
      return {
        canApproveBusinesses: true,
        canManageRiders: true,
        canEditRiderEarnings: true,
        canManageSalaries: true,
        canManageOrders: true,
        canViewAnalytics: true,
      };
    }
    return (
      activeStaffMember?.permissions || {
        canApproveBusinesses: false,
        canManageRiders: false,
        canEditRiderEarnings: false,
        canManageSalaries: false,
        canManageOrders: true,
        canViewAnalytics: true,
      }
    );
  }, [isOwner, activeStaffMember]);

  const [section, setSection] = useState<DashSection>('overview');
  const [cityFilter, setCityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [orderSearch, setOrderSearch] = useState<string>('');
  const [waPriceDrafts, setWaPriceDrafts] = useState<Record<string, string>>({});
  const [waConfirmingId, setWaConfirmingId] = useState<string | null>(null);
  const [waRejectingId, setWaRejectingId] = useState<string | null>(null);
  const [waRejectReason, setWaRejectReason] = useState<string>('');
  const [waPhotoPreview, setWaPhotoPreview] = useState<string | null>(null);
  const [activeProofOrder, setActiveProofOrder] = useState<Order | null>(null);
  const [activeProofRecord, setActiveProofRecord] = useState<DeliveryProofRecord | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);
  const [proofLoadError, setProofLoadError] = useState<string | null>(null);

  const openDeliveryProofModal = async (order: Order) => {
    if (!isOwner) return;
    setActiveProofOrder(order);
    setProofLoadError(null);
    const cached = deliveryProofs?.[order.id] ?? null;
    if (cached) {
      setActiveProofRecord(cached);
      setLoadingProof(false);
      return;
    }
    setActiveProofRecord(null);
    if (!onLoadDeliveryProof) {
      setLoadingProof(false);
      return;
    }
    setLoadingProof(true);
    try {
      const loaded = await onLoadDeliveryProof(order.id);
      setActiveProofRecord(loaded);
    } catch (err) {
      setProofLoadError(
        err instanceof Error ? err.message : 'Unable to load delivery proof photo.'
      );
    } finally {
      setLoadingProof(false);
    }
  };

  // Search bars across all Admin sections
  const [businessSearch, setBusinessSearch] = useState<string>('');
  const [riderSearch, setRiderSearch] = useState<string>('');
  const [salarySearch, setSalarySearch] = useState<string>('');
  const [salaryStatusFilter, setSalaryStatusFilter] = useState<'ALL' | 'paid' | 'pending'>('ALL');
  const [staffSearch, setStaffSearch] = useState<string>('');
  const [productSearch, setProductSearch] = useState<string>('');

  // Online Payments & Business Payouts state
  const [onlinePaySearch, setOnlinePaySearch] = useState<string>('');
  const [onlineMethodFilter, setOnlineMethodFilter] = useState<'ALL' | 'JAZZCASH' | 'EASYPAISA' | 'CARD'>('ALL');
  const [officeFilter, setOfficeFilter] = useState<'ALL' | 'settled' | 'unsettled'>('ALL');
  const [editingPaymentOrderId, setEditingPaymentOrderId] = useState<string | null>(null);
  const [paymentRefDraft, setPaymentRefDraft] = useState<string>('');
  const [paymentMethodDraft, setPaymentMethodDraft] = useState<PaymentMethod>('JAZZCASH');
  const [paymentStatusDraft, setPaymentStatusDraft] = useState<PaymentStatus>('paid');

  // Business Payouts & Sale Orders Daily / Monthly / Custom Date Range Report state
  const defaultTodayIso = new Date().toISOString().slice(0, 10);
  const defaultWeekAgoIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  })();
  const [bizReportMode, setBizReportMode] = useState<'daily' | 'monthly' | 'range' | 'all'>('daily');
  const [bizStartDate, setBizStartDate] = useState<string>(defaultWeekAgoIso);
  const [bizEndDate, setBizEndDate] = useState<string>(defaultTodayIso);
  const [bizPayoutSearch, setBizPayoutSearch] = useState<string>('');
  const [bizPayoutStatusFilter, setBizPayoutStatusFilter] = useState<'ALL' | 'paid' | 'pending'>('ALL');
  const [payoutEdits, setPayoutEdits] = useState<
    Record<
      string,
      {
        commissionPkr?: number;
        payoutMethod?: BusinessPayout['payoutMethod'];
        paymentRef?: string;
      }
    >
  >({});

  // Admin Business Daily, Monthly & Custom Range Delivered Order Reports & Order Printing state
  const [reportBizId, setReportBizId] = useState<string>('ALL');
  const [reportDate, setReportDate] = useState<string>(defaultTodayIso);
  const [reportMonth, setReportMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [bizReportSearch, setBizReportSearch] = useState<string>('');
  const [bizReportDeliveredOnly, setBizReportDeliveredOnly] = useState<boolean>(true);
  const [confirmDeleteBizId, setConfirmDeleteBizId] = useState<string | null>(null);
  const [adminPrintOrder, setAdminPrintOrder] = useState<Order | null>(null);
  const [adminPrintDailyReport, setAdminPrintDailyReport] = useState<boolean>(false);

  // Riders Daily, Monthly & Custom Date Range Payout & Distance Report state
  const [riderReportMode, setRiderReportMode] = useState<'daily' | 'monthly' | 'range'>('daily');
  const [riderReportDate, setRiderReportDate] = useState<string>(defaultTodayIso);
  const [riderReportMonth, setRiderReportMonth] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );
  const [riderStartDate, setRiderStartDate] = useState<string>(defaultWeekAgoIso);
  const [riderEndDate, setRiderEndDate] = useState<string>(defaultTodayIso);
  const [riderReportCity, setRiderReportCity] = useState<string>('ALL');
  const [riderReportRiderId, setRiderReportRiderId] = useState<string>('ALL');
  const [riderReportSearch, setRiderReportSearch] = useState<string>('');
  const [adminPrintRiderReport, setAdminPrintRiderReport] = useState<boolean>(false);

  // Separate Salary Sections view + Individual Printable Reports (Staff / Rider / Business Owner)
  const [salarySectionView, setSalarySectionView] = useState<'all' | 'riders' | 'staff'>('all');
  const [quickReportType, setQuickReportType] = useState<'rider' | 'business' | 'staff'>('rider');
  const [quickReportTargetId, setQuickReportTargetId] = useState<string>('');
  const [individualReportPreview, setIndividualReportPreview] = useState<{
    type: 'staff' | 'rider' | 'business';
    targetId: string;
  } | null>(null);
  const [adminPrintIndividual, setAdminPrintIndividual] = useState<{
    type: 'staff' | 'rider' | 'business';
    targetId: string;
  } | null>(null);

  // Add Rider Form
  const [showAddRider, setShowAddRider] = useState(true);
  const [riderName, setRiderName] = useState('');
  const [riderEmail, setRiderEmail] = useState('');
  const [riderPhone, setRiderPhone] = useState('+92 300 ');
  const [riderCnic, setRiderCnic] = useState('');
  const [riderCity, setRiderCity] = useState('Hasilpur');
  const [riderVehicle, setRiderVehicle] = useState<RiderVehicleType>('motorbike');
  const [riderPlate, setRiderPlate] = useState('');
  const [riderLoginId, setRiderLoginId] = useState(`RDR-${107 + riders.length}`);
  const [riderSalary, setRiderSalary] = useState('25000');
  const [savingRider, setSavingRider] = useState(false);

  // Rider wallet bonus inline edits
  const [bonusEdits, setBonusEdits] = useState<Record<string, string>>({});
  // Order riderEarningPkr inline edits
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingEarningVal, setEditingEarningVal] = useState<string>('');

  // Business Login ID inputs
  const [bizLoginInputs, setBizLoginInputs] = useState<Record<string, string>>({});

  // Full Business Edit state (App Owner)
  const [editingBizId, setEditingBizId] = useState<string | null>(null);
  const [bizDraft, setBizDraft] = useState<Partial<Restaurant>>({});

  // Full Rider Edit state (App Owner)
  const [editingRiderId, setEditingRiderId] = useState<string | null>(null);
  const [riderDraft, setRiderDraft] = useState<Partial<Rider>>({});

  // Full Staff Edit state (App Owner)
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffDraft, setStaffDraft] = useState<Partial<StaffMember>>({});

  // Catalog / Product Price & Picture Editor state
  const [catalogStoreId, setCatalogStoreId] = useState<string>(restaurants[0]?.id || '');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [prodDraftName, setProdDraftName] = useState('');
  const [prodDraftPrice, setProdDraftPrice] = useState('');
  const [prodDraftVarieties, setProdDraftVarieties] = useState<
    Array<{ label: string; pricePkr: string }>
  >(() => [0, 1, 2, 3].map(() => ({ label: '', pricePkr: '' })));
  const [prodDraftCategory, setProdDraftCategory] = useState('');
  const [prodDraftDesc, setProdDraftDesc] = useState('');
  const [prodDraftImage, setProdDraftImage] = useState('');
  const [prodDraftAvailable, setProdDraftAvailable] = useState(true);
  const [uploadingProdImg, setUploadingProdImg] = useState(false);

  // WhatsApp & Welcome Settings state
  const [whatsappInput, setWhatsappInput] = useState(appSettings.whatsappNumber);
  const [welcomeTitleInput, setWelcomeTitleInput] = useState(
    appSettings.welcomeTitle || 'Welcome to HSP delivery'
  );
  const [welcomeSubtitleInput, setWelcomeSubtitleInput] = useState(
    appSettings.welcomeSubtitle || ''
  );
  const [savingSettings, setSavingSettings] = useState(false);

  // Admin Delivery Rates state (Customers & Riders)
  const [custBaseKmInput, setCustBaseKmInput] = useState(String(liveDeliveryRates.customerBaseKm));
  const [custBaseFeeInput, setCustBaseFeeInput] = useState(
    String(liveDeliveryRates.customerBaseFeePkr)
  );
  const [custExtraPerKmInput, setCustExtraPerKmInput] = useState(
    String(liveDeliveryRates.customerExtraPerKmPkr)
  );
  const [riderBaseKmInput, setRiderBaseKmInput] = useState(String(liveDeliveryRates.riderBaseKm));
  const [riderBasePayInput, setRiderBasePayInput] = useState(
    String(liveDeliveryRates.riderBasePayPkr)
  );
  const [riderExtraPerKmInput, setRiderExtraPerKmInput] = useState(
    String(liveDeliveryRates.riderExtraPerKmPkr)
  );
  const [savingRates, setSavingRates] = useState(false);
  const [ratesError, setRatesError] = useState('');

  // Admin Business Categories Manager state
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryIndex, setEditingCategoryIndex] = useState<number | null>(null);
  const [editingCategoryDraft, setEditingCategoryDraft] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [savingCategories, setSavingCategories] = useState(false);

  useEffect(() => {
    setCustBaseKmInput(String(liveDeliveryRates.customerBaseKm));
    setCustBaseFeeInput(String(liveDeliveryRates.customerBaseFeePkr));
    setCustExtraPerKmInput(String(liveDeliveryRates.customerExtraPerKmPkr));
    setRiderBaseKmInput(String(liveDeliveryRates.riderBaseKm));
    setRiderBasePayInput(String(liveDeliveryRates.riderBasePayPkr));
    setRiderExtraPerKmInput(String(liveDeliveryRates.riderExtraPerKmPkr));
  }, [
    liveDeliveryRates.customerBaseKm,
    liveDeliveryRates.customerBaseFeePkr,
    liveDeliveryRates.customerExtraPerKmPkr,
    liveDeliveryRates.riderBaseKm,
    liveDeliveryRates.riderBasePayPkr,
    liveDeliveryRates.riderExtraPerKmPkr,
  ]);

  // Add Staff / Manager Form (Owner only)
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRole, setStaffRole] = useState<'manager' | 'staff'>('manager');
  const [staffPhone, setStaffPhone] = useState('+92 300 ');
  const [staffCity, setStaffCity] = useState('Hasilpur');
  const [staffLoginId, setStaffLoginId] = useState(`MGR-${103 + staffMembers.length}`);
  const [staffSalary, setStaffSalary] = useState('45000');
  const [staffPerms, setStaffPerms] = useState<StaffPermissions>({
    canApproveBusinesses: false,
    canManageRiders: true,
    canEditRiderEarnings: false,
    canManageSalaries: false,
    canManageOrders: true,
    canViewAnalytics: true,
  });
  const [savingStaff, setSavingStaff] = useState(false);

  // Salary draft edits per row ID
  const [salaryEdits, setSalaryEdits] = useState<
    Record<string, { base?: number; bonus?: number; deduction?: number }>
  >({});

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const currentMonthLabel = new Date().toLocaleDateString('en-PK', {
    month: 'long',
    year: 'numeric',
  });

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((o) => {
      if (cityFilter !== 'ALL' && o.city !== cityFilter) return false;
      if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
      if (q) {
        const hit =
          o.orderCode.toLowerCase().includes(q) ||
          o.restaurantName.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          (o.customerPhone || '').toLowerCase().includes(q) ||
          (o.riderName || '').toLowerCase().includes(q) ||
          (o.paymentRef || '').toLowerCase().includes(q) ||
          o.paymentMethod.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [orders, cityFilter, statusFilter, orderSearch]);

  const metrics = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + o.totalPkr, 0);
    const codCount = filteredOrders.filter((o) => o.paymentMethod === 'COD').length;
    const codShare =
      filteredOrders.length > 0 ? Math.round((codCount / filteredOrders.length) * 100) : 0;
    const ratedOrders = filteredOrders.filter((o) => typeof o.driverRating === 'number');
    const avgRating =
      ratedOrders.length > 0
        ? ratedOrders.reduce((s, o) => s + (o.driverRating || 0), 0) / ratedOrders.length
        : 4.9;
    return {
      totalOrders: filteredOrders.length,
      totalRevenue,
      codShare,
      avgRating,
    };
  }, [filteredOrders]);

  const cityChartData = useMemo(() => {
    const bucket: Record<string, { city: string; revenue: number; orders: number }> = {};
    PAKISTAN_CITIES.forEach((c) => {
      bucket[c.name] = { city: c.name, revenue: 0, orders: 0 };
    });
    orders.forEach((o) => {
      if (!bucket[o.city]) {
        bucket[o.city] = { city: o.city, revenue: 0, orders: 0 };
      }
      bucket[o.city].revenue += o.totalPkr;
      bucket[o.city].orders += 1;
    });
    return Object.values(bucket).filter(
      (b) => b.orders > 0 || ['Hasilpur', 'Lahore', 'Karachi', 'Islamabad'].includes(b.city)
    );
  }, [orders]);

  // Past 7 Days Hasilpur Daily Order Volume & Total Revenue
  const hasilpur7DayData = useMemo(() => {
    const baseline = [
      { offset: 6, orders: 14, revenue: 21400 },
      { offset: 5, orders: 18, revenue: 28900 },
      { offset: 4, orders: 16, revenue: 25600 },
      { offset: 3, orders: 22, revenue: 36400 },
      { offset: 2, orders: 27, revenue: 44800 },
      { offset: 1, orders: 31, revenue: 52300 },
      { offset: 0, orders: 24, revenue: 39600 },
    ];
    const today = new Date();
    const hasilpurOrders = orders.filter((o) => o.city === 'Hasilpur');

    return baseline.map((b) => {
      const d = new Date(today);
      d.setDate(today.getDate() - b.offset);
      const isoDay = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric' });
      const liveForDay = hasilpurOrders.filter(
        (o) => (o.createdAt || '').slice(0, 10) === isoDay
      );
      const liveRevenue = liveForDay.reduce((s, o) => s + o.totalPkr, 0);

      return {
        day: label,
        orders: b.orders + liveForDay.length,
        revenue: b.revenue + liveRevenue,
      };
    });
  }, [orders]);

  const hasilpur7DayTotals = useMemo(() => {
    return hasilpur7DayData.reduce(
      (acc, d) => ({
        orders: acc.orders + d.orders,
        revenue: acc.revenue + d.revenue,
      }),
      { orders: 0, revenue: 0 }
    );
  }, [hasilpur7DayData]);

  // Combined Rider + Staff salary ledger for current month
  const payrollRows = useMemo<SalaryPayment[]>(() => {
    const list: SalaryPayment[] = [];
    riders.forEach((r) => {
      const id = `sal-${r.id}-${currentMonthKey}`;
      const existing = salaryRecords.find((s) => s.id === id);
      const baseSalaryPkr = existing?.baseSalaryPkr ?? r.monthlySalaryPkr ?? 25000;
      const bonusPkr = existing?.bonusPkr ?? r.walletBonusPkr ?? 0;
      const deductionPkr = existing?.deductionPkr ?? 0;
      list.push({
        id,
        targetType: 'rider',
        targetId: r.id,
        targetName: r.name,
        roleLabel: `Rider (${r.loginId || 'No ID'}) · ${r.city}`,
        monthKey: currentMonthKey,
        baseSalaryPkr,
        bonusPkr,
        deductionPkr,
        netAmountPkr: Math.max(0, baseSalaryPkr + bonusPkr - deductionPkr),
        status: existing?.status || 'pending',
        paidAt: existing?.paidAt,
        createdAt: existing?.createdAt || new Date().toISOString(),
      });
    });

    staffMembers.forEach((st) => {
      const id = `sal-${st.id}-${currentMonthKey}`;
      const existing = salaryRecords.find((s) => s.id === id);
      const baseSalaryPkr = existing?.baseSalaryPkr ?? st.monthlySalaryPkr ?? 30000;
      const bonusPkr = existing?.bonusPkr ?? 0;
      const deductionPkr = existing?.deductionPkr ?? 0;
      list.push({
        id,
        targetType: 'staff',
        targetId: st.id,
        targetName: st.name,
        roleLabel: `${st.role === 'manager' ? 'Manager' : 'Staff'} (${st.loginId}) · ${st.city}`,
        monthKey: currentMonthKey,
        baseSalaryPkr,
        bonusPkr,
        deductionPkr,
        netAmountPkr: Math.max(0, baseSalaryPkr + bonusPkr - deductionPkr),
        status: existing?.status || 'pending',
        paidAt: existing?.paidAt,
        createdAt: existing?.createdAt || new Date().toISOString(),
      });
    });

    return list;
  }, [riders, staffMembers, salaryRecords, currentMonthKey]);

  const payrollSummary = useMemo(() => {
    const totalNet = payrollRows.reduce((s, r) => s + r.netAmountPkr, 0);
    const totalPaid = payrollRows
      .filter((r) => r.status === 'paid')
      .reduce((s, r) => s + r.netAmountPkr, 0);
    return {
      totalNet,
      totalPaid,
      totalPending: Math.max(0, totalNet - totalPaid),
      paidCount: payrollRows.filter((r) => r.status === 'paid').length,
    };
  }, [payrollRows]);

  const riderPayrollRows = useMemo(
    () => payrollRows.filter((r) => r.targetType === 'rider'),
    [payrollRows]
  );
  const staffPayrollRows = useMemo(
    () => payrollRows.filter((r) => r.targetType === 'staff'),
    [payrollRows]
  );

  const riderPayrollSummary = useMemo(() => {
    const totalNet = riderPayrollRows.reduce((s, r) => s + r.netAmountPkr, 0);
    const totalPaid = riderPayrollRows
      .filter((r) => r.status === 'paid')
      .reduce((s, r) => s + r.netAmountPkr, 0);
    return {
      totalNet,
      totalPaid,
      totalPending: Math.max(0, totalNet - totalPaid),
      paidCount: riderPayrollRows.filter((r) => r.status === 'paid').length,
    };
  }, [riderPayrollRows]);

  const staffPayrollSummary = useMemo(() => {
    const totalNet = staffPayrollRows.reduce((s, r) => s + r.netAmountPkr, 0);
    const totalPaid = staffPayrollRows
      .filter((r) => r.status === 'paid')
      .reduce((s, r) => s + r.netAmountPkr, 0);
    return {
      totalNet,
      totalPaid,
      totalPending: Math.max(0, totalNet - totalPaid),
      paidCount: staffPayrollRows.filter((r) => r.status === 'paid').length,
    };
  }, [staffPayrollRows]);

  const handleCreateRider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!riderName.trim() || !riderPhone.trim() || !riderPlate.trim() || !riderLoginId.trim()) return;
    setSavingRider(true);
    try {
      const cleanedEmail = riderEmail.trim().toLowerCase();
      await onAddRider({
        name: riderName.trim(),
        ...(cleanedEmail.includes('@') ? { email: cleanedEmail } : {}),
        phone: riderPhone.trim(),
        cnic: riderCnic.trim() || undefined,
        city: riderCity,
        vehicleType: riderVehicle,
        vehiclePlate: riderPlate.trim().toUpperCase(),
        loginId: riderLoginId.trim().toUpperCase(),
        monthlySalaryPkr: Math.max(5000, Number(riderSalary) || 25000),
      });
      setRiderName('');
      setRiderEmail('');
      setRiderPhone('+92 300 ');
      setRiderCnic('');
      setRiderPlate('');
      setRiderLoginId(`RDR-${108 + riders.length}`);
    } finally {
      setSavingRider(false);
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim() || !staffLoginId.trim()) return;
    setSavingStaff(true);
    try {
      const cleanedEmail = staffEmail.trim().toLowerCase();
      await onAddStaffMember({
        name: staffName.trim(),
        role: staffRole,
        ...(cleanedEmail.includes('@') ? { email: cleanedEmail } : {}),
        phone: staffPhone.trim() || '+92 300 0000000',
        city: staffCity,
        loginId: staffLoginId.trim().toUpperCase(),
        monthlySalaryPkr: Math.max(5000, Number(staffSalary) || 35000),
        permissions: staffPerms,
      });
      setStaffName('');
      setStaffEmail('');
      setStaffPhone('+92 300 ');
      setStaffLoginId(
        staffRole === 'manager'
          ? `MGR-${104 + staffMembers.length}`
          : `STF-${104 + staffMembers.length}`
      );
    } finally {
      setSavingStaff(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await onUpdateAppSettings({
        whatsappNumber: whatsappInput.trim() || '+92 300 7741209',
        welcomeTitle: welcomeTitleInput.trim() || 'Welcome to HSP delivery',
        welcomeSubtitle: welcomeSubtitleInput.trim() || undefined,
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const draftDeliveryRates = useMemo(
    () =>
      resolveDeliveryRates({
        customerBaseKm: Number(custBaseKmInput),
        customerBaseFeePkr: Number(custBaseFeeInput),
        customerExtraPerKmPkr: Number(custExtraPerKmInput),
        riderBaseKm: Number(riderBaseKmInput),
        riderBasePayPkr: Number(riderBasePayInput),
        riderExtraPerKmPkr: Number(riderExtraPerKmInput),
      }),
    [
      custBaseKmInput,
      custBaseFeeInput,
      custExtraPerKmInput,
      riderBaseKmInput,
      riderBasePayInput,
      riderExtraPerKmInput,
    ]
  );

  const handleSaveDeliveryRates = async (e: React.FormEvent) => {
    e.preventDefault();
    setRatesError('');
    const cKm = Number(custBaseKmInput);
    const cFee = Number(custBaseFeeInput);
    const cExtra = Number(custExtraPerKmInput);
    const rKm = Number(riderBaseKmInput);
    const rPay = Number(riderBasePayInput);
    const rExtra = Number(riderExtraPerKmInput);

    if (
      !Number.isFinite(cKm) ||
      cKm < 0.5 ||
      cKm > 50 ||
      !Number.isFinite(rKm) ||
      rKm < 0.5 ||
      rKm > 50
    ) {
      setRatesError('Base distance must be between 0.5 km and 50 km.');
      return;
    }
    if (
      !Number.isFinite(cFee) ||
      cFee < 0 ||
      cFee > 50000 ||
      !Number.isFinite(rPay) ||
      rPay < 0 ||
      rPay > 50000
    ) {
      setRatesError('Base delivery fee and rider pay must be between Rs. 0 and Rs. 50,000.');
      return;
    }
    if (
      !Number.isFinite(cExtra) ||
      cExtra < 0 ||
      cExtra > 10000 ||
      !Number.isFinite(rExtra) ||
      rExtra < 0 ||
      rExtra > 10000
    ) {
      setRatesError('Per-km extra rates must be between Rs. 0 and Rs. 10,000.');
      return;
    }

    setSavingRates(true);
    try {
      await onUpdateAppSettings({
        customerBaseKm: Number(cKm.toFixed(1)),
        customerBaseFeePkr: Math.round(cFee),
        customerExtraPerKmPkr: Math.round(cExtra),
        riderBaseKm: Number(rKm.toFixed(1)),
        riderBasePayPkr: Math.round(rPay),
        riderExtraPerKmPkr: Math.round(rExtra),
      });
    } finally {
      setSavingRates(false);
    }
  };

  const handleResetDeliveryRates = async () => {
    setRatesError('');
    setSavingRates(true);
    try {
      await onUpdateAppSettings({ ...DEFAULT_DELIVERY_RATES });
    } finally {
      setSavingRates(false);
    }
  };

  const handleAddBusinessCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCategoryError('');
    const trimmed = newCategoryName.trim();
    if (trimmed.length < 2 || trimmed.length > 60) {
      setCategoryError('Category name must be between 2 and 60 characters.');
      return;
    }
    if (liveBusinessCategories.length >= 40) {
      setCategoryError('Maximum of 40 business categories reached.');
      return;
    }
    if (liveBusinessCategories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setCategoryError(`"${trimmed}" already exists in business categories.`);
      return;
    }
    setSavingCategories(true);
    try {
      await onUpdateAppSettings({
        businessCategories: [...liveBusinessCategories, trimmed],
      });
      setNewCategoryName('');
    } finally {
      setSavingCategories(false);
    }
  };

  const handleSaveEditedCategory = async (idx: number) => {
    setCategoryError('');
    const oldName = liveBusinessCategories[idx];
    const trimmed = editingCategoryDraft.trim();
    if (!oldName) return;
    if (trimmed.length < 2 || trimmed.length > 60) {
      setCategoryError('Category name must be between 2 and 60 characters.');
      return;
    }
    if (
      liveBusinessCategories.some(
        (c, i) => i !== idx && c.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      setCategoryError(`"${trimmed}" already exists.`);
      return;
    }
    setSavingCategories(true);
    try {
      const nextList = liveBusinessCategories.map((c, i) => (i === idx ? trimmed : c));
      await onUpdateAppSettings({ businessCategories: nextList });
      if (oldName !== trimmed && onRenameBusinessCategory) {
        await onRenameBusinessCategory(oldName, trimmed);
      }
      setEditingCategoryIndex(null);
      setEditingCategoryDraft('');
    } finally {
      setSavingCategories(false);
    }
  };

  const handleDeleteBusinessCategory = async (idx: number) => {
    setCategoryError('');
    if (liveBusinessCategories.length <= 1) {
      setCategoryError('At least one business category must remain active.');
      return;
    }
    setSavingCategories(true);
    try {
      const nextList = liveBusinessCategories.filter((_, i) => i !== idx);
      await onUpdateAppSettings({ businessCategories: nextList });
      if (editingCategoryIndex === idx) {
        setEditingCategoryIndex(null);
        setEditingCategoryDraft('');
      }
    } finally {
      setSavingCategories(false);
    }
  };

  const handleResetBusinessCategories = async () => {
    setCategoryError('');
    setSavingCategories(true);
    try {
      await onUpdateAppSettings({ businessCategories: [...BUSINESS_TYPES] });
      setEditingCategoryIndex(null);
      setEditingCategoryDraft('');
    } finally {
      setSavingCategories(false);
    }
  };

  const resolveOrderDistanceKm = (o: Order) => {
    if (typeof o.distanceKm === 'number' && o.distanceKm > 0) {
      return Number(o.distanceKm.toFixed(1));
    }
    return calculateRoadDistanceKm(
      { lat: o.restaurantLat, lng: o.restaurantLng },
      { lat: o.deliveryLat, lng: o.deliveryLng }
    );
  };

  const handleExportCsv = () => {
    const deliveredOrders = filteredOrders.filter((o) => o.status === 'delivered');
    const deliveredTotalKm = Number(
      deliveredOrders.reduce((s, o) => s + resolveOrderDistanceKm(o), 0).toFixed(1)
    );
    const rows: Array<Array<string | number>> = filteredOrders.map((o) => {
      const distKm = resolveOrderDistanceKm(o);
      return [
        o.orderCode,
        o.createdAt,
        o.city,
        o.restaurantName,
        o.customerName,
        distKm.toFixed(1),
        o.paymentMethod,
        o.deliveryFeePkr,
        o.tipPkr ?? 0,
        o.riderEarningPkr ?? calculateRiderDeliveryEarningPkr(distKm, liveDeliveryRates),
        o.totalPkr,
        o.status,
        o.riderName || 'Unassigned',
      ];
    });
    rows.push([
      'DELIVERED TOTAL',
      new Date().toISOString().slice(0, 10),
      cityFilter === 'ALL' ? 'All Cities' : cityFilter,
      `${deliveredOrders.length} delivered orders`,
      '',
      deliveredTotalKm.toFixed(1),
      '',
      deliveredOrders.reduce((s, o) => s + o.deliveryFeePkr, 0),
      deliveredOrders.reduce((s, o) => s + (o.tipPkr ?? 0), 0),
      deliveredOrders.reduce(
        (s, o) =>
          s +
          (o.riderEarningPkr ??
            calculateRiderDeliveryEarningPkr(resolveOrderDistanceKm(o), liveDeliveryRates)),
        0
      ),
      deliveredOrders.reduce((s, o) => s + o.totalPkr, 0),
      'DELIVERED',
      '',
    ]);
    downloadCsv(
      `hsp-delivery-report-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Order Code',
        'Date',
        'City',
        'Store / Business',
        'Customer',
        'Distance (km)',
        'Payment Method',
        'Delivery Fee (PKR)',
        'Tip (PKR)',
        'Rider Pay (PKR)',
        'Total (PKR)',
        'Status',
        'Rider',
      ],
      rows
    );
  };

  const handleDownloadPayrollCsv = (subset?: 'rider' | 'staff') => {
    const rowsToExport =
      subset === 'rider'
        ? riderPayrollRows
        : subset === 'staff'
          ? staffPayrollRows
          : payrollRows;
    const fileLabel = subset === 'rider' ? 'riders-salary' : subset === 'staff' ? 'staff-salary' : 'payroll';
    downloadCsv(
      `hsp-delivery-${fileLabel}-${currentMonthKey}.csv`,
      ['Type', 'Name', 'Role & ID', 'Month', 'Base Salary (PKR)', 'Bonus (PKR)', 'Deduction (PKR)', 'Net Payable (PKR)', 'Status'],
      rowsToExport.map((row) => [
        row.targetType.toUpperCase(),
        row.targetName,
        row.roleLabel,
        row.monthKey,
        row.baseSalaryPkr,
        row.bonusPkr,
        row.deductionPkr,
        row.netAmountPkr,
        row.status.toUpperCase(),
      ])
    );
  };

  // Online Payments metrics & filtered list
  const onlineOrdersAll = useMemo(
    () => orders.filter((o) => o.paymentMethod !== 'COD' && o.status !== 'cancelled'),
    [orders]
  );

  const onlinePaymentSummary = useMemo(() => {
    const sumFor = (method: PaymentMethod) =>
      onlineOrdersAll
        .filter((o) => o.paymentMethod === method)
        .reduce((s, o) => s + o.totalPkr, 0);
    const countFor = (method: PaymentMethod) =>
      onlineOrdersAll.filter((o) => o.paymentMethod === method).length;

    const codOrders = orders.filter((o) => o.paymentMethod === 'COD' && o.status !== 'cancelled');
    return {
      totalOnlinePkr: onlineOrdersAll.reduce((s, o) => s + o.totalPkr, 0),
      totalOnlineCount: onlineOrdersAll.length,
      jazzCashPkr: sumFor('JAZZCASH'),
      jazzCashCount: countFor('JAZZCASH'),
      easyPaisaPkr: sumFor('EASYPAISA'),
      easyPaisaCount: countFor('EASYPAISA'),
      cardPkr: sumFor('CARD'),
      cardCount: countFor('CARD'),
      codTotalPkr: codOrders.reduce((s, o) => s + o.totalPkr, 0),
      codCount: codOrders.length,
    };
  }, [onlineOrdersAll, orders]);

  const filteredOnlineOrders = useMemo(() => {
    const q = onlinePaySearch.trim().toLowerCase();
    return onlineOrdersAll.filter((o) => {
      if (onlineMethodFilter !== 'ALL' && o.paymentMethod !== onlineMethodFilter) return false;
      if (officeFilter === 'settled' && !o.officeSettled) return false;
      if (officeFilter === 'unsettled' && o.officeSettled) return false;
      if (q) {
        const hit =
          o.orderCode.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          (o.customerPhone || '').toLowerCase().includes(q) ||
          o.restaurantName.toLowerCase().includes(q) ||
          (o.paymentRef || '').toLowerCase().includes(q) ||
          (o.riderName || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [onlineOrdersAll, onlineMethodFilter, officeFilter, onlinePaySearch]);

  const activeBizPeriodKey = useMemo(() => {
    if (bizReportMode === 'daily') return reportDate;
    if (bizReportMode === 'monthly') return reportMonth;
    if (bizReportMode === 'range') return `${bizStartDate}_${bizEndDate}`;
    return currentMonthKey;
  }, [bizReportMode, reportDate, reportMonth, bizStartDate, bizEndDate, currentMonthKey]);

  const activeBizPeriodLabel = useMemo(() => {
    if (bizReportMode === 'daily') {
      const dt = new Date(`${reportDate}T00:00:00`);
      return Number.isNaN(dt.getTime())
        ? reportDate
        : dt.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (bizReportMode === 'monthly') {
      const dt = new Date(`${reportMonth}-01T00:00:00`);
      return Number.isNaN(dt.getTime())
        ? reportMonth
        : dt.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
    }
    if (bizReportMode === 'range') {
      return formatDateRangeLabel(bizStartDate, bizEndDate);
    }
    return `All Recorded Dates (${currentMonthLabel})`;
  }, [bizReportMode, reportDate, reportMonth, bizStartDate, bizEndDate, currentMonthLabel]);

  // Business Owners Daily, Monthly & Custom Range Payouts (Paid / Pending) strictly from DELIVERED orders
  const businessPayoutRows = useMemo(() => {
    const nowIso = new Date().toISOString();
    return restaurants.map((biz) => {
      const periodStoreOrders = orders.filter((o) => {
        if (o.restaurantId !== biz.id || o.status === 'cancelled') return false;
        const orderDay = (o.createdAt || '').slice(0, 10);
        if (bizReportMode === 'daily') return orderDay === reportDate;
        if (bizReportMode === 'monthly') return (o.createdAt || '').slice(0, 7) === reportMonth;
        if (bizReportMode === 'range') return orderDay >= bizStartDate && orderDay <= bizEndDate;
        return true;
      });
      const deliveredStoreOrders = periodStoreOrders.filter((o) => o.status === 'delivered');
      const inProgressCount = Math.max(0, periodStoreOrders.length - deliveredStoreOrders.length);
      const computedGross = deliveredStoreOrders.reduce(
        (s, o) => s + (o.subtotalPkr || o.totalPkr),
        0
      );
      const id =
        bizReportMode === 'daily'
          ? `payday-${biz.id}-${reportDate}`
          : bizReportMode === 'range'
            ? `payrng-${biz.id}-${bizStartDate}_${bizEndDate}`
            : `pay-${biz.id}-${activeBizPeriodKey}`;
      const existing = businessPayouts.find(
        (p) =>
          p.id === id ||
          (bizReportMode === 'all' && p.restaurantId === biz.id && p.monthKey === currentMonthKey)
      );
      const grossSubtotalPkr =
        bizReportMode === 'all'
          ? Math.max(computedGross, existing?.grossSubtotalPkr ?? 0)
          : computedGross;
      const commissionPkr = existing?.commissionPkr ?? 0;
      const netPayablePkr = Math.max(0, grossSubtotalPkr - commissionPkr);

      const record: BusinessPayout = {
        id,
        restaurantId: biz.id,
        restaurantName: biz.name,
        ownerId: biz.ownerId,
        ownerEmail: biz.ownerEmail?.toLowerCase(),
        city: biz.city,
        businessLoginId: biz.businessLoginId,
        monthKey: activeBizPeriodKey,
        grossSubtotalPkr,
        commissionPkr,
        netPayablePkr,
        payoutMethod: existing?.payoutMethod || 'BANK',
        paymentRef: existing?.paymentRef,
        status: existing?.status || 'pending',
        paidAt: existing?.paidAt,
        updatedAt: existing?.updatedAt || nowIso,
        createdAt: existing?.createdAt || nowIso,
      };
      return {
        record,
        orderCount: deliveredStoreOrders.length,
        inProgressCount,
        deliveredOrders: deliveredStoreOrders,
        onlineSubtotalPkr: deliveredStoreOrders
          .filter((o) => o.paymentMethod !== 'COD')
          .reduce((s, o) => s + (o.subtotalPkr || o.totalPkr), 0),
        codSubtotalPkr: deliveredStoreOrders
          .filter((o) => o.paymentMethod === 'COD')
          .reduce((s, o) => s + (o.subtotalPkr || o.totalPkr), 0),
      };
    });
  }, [
    restaurants,
    orders,
    businessPayouts,
    bizReportMode,
    reportDate,
    reportMonth,
    bizStartDate,
    bizEndDate,
    activeBizPeriodKey,
    currentMonthKey,
  ]);

  const filteredBusinessPayouts = useMemo(() => {
    const q = bizPayoutSearch.trim().toLowerCase();
    return businessPayoutRows.filter(({ record }) => {
      if (bizPayoutStatusFilter !== 'ALL' && record.status !== bizPayoutStatusFilter) return false;
      if (q) {
        const hit =
          record.restaurantName.toLowerCase().includes(q) ||
          record.city.toLowerCase().includes(q) ||
          (record.businessLoginId || '').toLowerCase().includes(q) ||
          (record.paymentRef || '').toLowerCase().includes(q) ||
          record.payoutMethod.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [businessPayoutRows, bizPayoutStatusFilter, bizPayoutSearch]);

  const businessPayoutSummary = useMemo(() => {
    const totalPayable = businessPayoutRows.reduce((s, r) => s + r.record.netPayablePkr, 0);
    const totalPaid = businessPayoutRows
      .filter((r) => r.record.status === 'paid')
      .reduce((s, r) => s + r.record.netPayablePkr, 0);
    const totalDeliveredOrders = businessPayoutRows.reduce((s, r) => s + r.orderCount, 0);
    const paidCount = businessPayoutRows.filter((r) => r.record.status === 'paid').length;
    return {
      totalPayable,
      totalPaid,
      totalDeliveredOrders,
      totalPending: Math.max(0, totalPayable - totalPaid),
      paidCount,
      pendingCount: businessPayoutRows.length - paidCount,
    };
  }, [businessPayoutRows]);

  // Admin Business Daily, Monthly & Custom Range Delivered Orders
  const adminDailyReportOrders = useMemo(() => {
    const q = bizReportSearch.trim().toLowerCase();
    return orders.filter((o) => {
      if (o.status === 'cancelled') return false;
      if (bizReportDeliveredOnly && o.status !== 'delivered') return false;
      if (reportBizId !== 'ALL' && o.restaurantId !== reportBizId) return false;
      const orderDay = (o.createdAt || '').slice(0, 10);
      if (bizReportMode === 'daily' && reportDate) {
        if (orderDay !== reportDate) return false;
      } else if (bizReportMode === 'monthly' && reportMonth) {
        if ((o.createdAt || '').slice(0, 7) !== reportMonth) return false;
      } else if (bizReportMode === 'range') {
        if (orderDay < bizStartDate || orderDay > bizEndDate) return false;
      }
      if (q) {
        const hit =
          o.orderCode.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.restaurantName.toLowerCase().includes(q) ||
          (o.customerPhone || '').toLowerCase().includes(q) ||
          o.items.some((i) => i.name.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [
    orders,
    reportBizId,
    bizReportMode,
    reportDate,
    reportMonth,
    bizStartDate,
    bizEndDate,
    bizReportSearch,
    bizReportDeliveredOnly,
  ]);

  const adminDailyReportTotals = useMemo(() => {
    const deliveredOrders = adminDailyReportOrders.filter((o) => o.status === 'delivered');
    return {
      count: adminDailyReportOrders.length,
      validCount: deliveredOrders.length,
      subtotalPkr: deliveredOrders.reduce((s, o) => s + (o.subtotalPkr || o.totalPkr), 0),
      totalBillPkr: deliveredOrders.reduce((s, o) => s + o.totalPkr, 0),
      onlinePkr: deliveredOrders
        .filter((o) => o.paymentMethod !== 'COD')
        .reduce((s, o) => s + (o.subtotalPkr || o.totalPkr), 0),
      codPkr: deliveredOrders
        .filter((o) => o.paymentMethod === 'COD')
        .reduce((s, o) => s + (o.subtotalPkr || o.totalPkr), 0),
    };
  }, [adminDailyReportOrders]);

  // Riders Daily, Monthly & Custom Date Range Payout & Distance Report
  const riderPeriodKey =
    riderReportMode === 'daily'
      ? riderReportDate
      : riderReportMode === 'monthly'
        ? riderReportMonth
        : `${riderStartDate}_${riderEndDate}`;
  const riderPeriodLabel = useMemo(() => {
    if (riderReportMode === 'daily') {
      const dt = new Date(`${riderReportDate}T00:00:00`);
      return Number.isNaN(dt.getTime())
        ? riderReportDate
        : dt.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (riderReportMode === 'range') {
      return formatDateRangeLabel(riderStartDate, riderEndDate);
    }
    const dt = new Date(`${riderReportMonth}-01T00:00:00`);
    return Number.isNaN(dt.getTime())
      ? riderReportMonth
      : dt.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
  }, [riderReportMode, riderReportDate, riderReportMonth, riderStartDate, riderEndDate]);

  const riderReportData = useMemo(() => {
    const seedTrips = getSeedRiderMonthlyEarnings();
    const liveTrips = orders
      .filter((o) => o.status === 'delivered' && o.riderId)
      .map((o) => {
        const distKm = resolveOrderDistanceKm(o);
        const riderPay =
          typeof o.riderEarningPkr === 'number'
            ? o.riderEarningPkr
            : calculateRiderDeliveryEarningPkr(distKm, liveDeliveryRates);
        return {
          id: `live-${o.id}`,
          orderCode: o.orderCode,
          riderId: o.riderId as string,
          restaurantName: o.restaurantName,
          dropoffArea: o.deliveryAddress,
          city: o.city,
          deliveryFeePkr: riderPay,
          tipPkr: o.tipPkr ?? 0,
          paymentMethod: o.paymentMethod,
          whatsappAmountAlreadyPaid: Boolean(o.whatsappAmountAlreadyPaid),
          completedAt: o.updatedAt || o.createdAt,
          distanceKm: distKm,
          orderTotalPkr: o.totalPkr,
          source: 'live' as const,
        };
      });

    const seenCodes = new Set(liveTrips.map((t) => t.orderCode));
    const mergedTrips = [
      ...liveTrips,
      ...seedTrips
        .filter((e) => !seenCodes.has(e.orderCode))
        .map((e) => ({
          ...e,
          whatsappAmountAlreadyPaid: false,
          distanceKm: typeof e.distanceKm === 'number' && e.distanceKm > 0 ? Number(e.distanceKm.toFixed(1)) : 3.0,
          orderTotalPkr: e.deliveryFeePkr + e.tipPkr,
        })),
    ].filter((t) => {
      if (riderReportMode === 'range') {
        const dayIso = (t.completedAt || '').slice(0, 10);
        if (dayIso < riderStartDate || dayIso > riderEndDate) return false;
      } else {
        const iso = (t.completedAt || '').slice(0, riderReportMode === 'daily' ? 10 : 7);
        if (iso !== riderPeriodKey) return false;
      }
      if (riderReportCity !== 'ALL' && t.city !== riderReportCity) return false;
      if (riderReportRiderId !== 'ALL' && t.riderId !== riderReportRiderId) return false;
      return true;
    });

    const q = riderReportSearch.trim().toLowerCase();
    const rows = riders
      .filter((r) => {
        if (riderReportCity !== 'ALL' && r.city !== riderReportCity) return false;
        if (riderReportRiderId !== 'ALL' && r.id !== riderReportRiderId) return false;
        if (q) {
          return (
            r.name.toLowerCase().includes(q) ||
            r.city.toLowerCase().includes(q) ||
            (r.loginId || '').toLowerCase().includes(q) ||
            r.phone.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .map((rider) => {
        const trips = mergedTrips.filter((t) => t.riderId === rider.id);
        const tripsCount = trips.length;
        const totalDistanceKm = Number(
          trips.reduce((s, t) => s + (t.distanceKm ?? 0), 0).toFixed(1)
        );
        const avgDistanceKm =
          tripsCount > 0 ? Number((totalDistanceKm / tripsCount).toFixed(1)) : 0;
        const deliveryPayPkr = trips.reduce((s, t) => s + t.deliveryFeePkr, 0);
        const tipsPkr = trips.reduce((s, t) => s + t.tipPkr, 0);
        const codCashPkr = trips
          .filter((t) => t.paymentMethod === 'COD' && !t.whatsappAmountAlreadyPaid)
          .reduce((s, t) => s + t.orderTotalPkr, 0);
        const onlineCount = trips.filter(
          (t) => t.paymentMethod !== 'COD' || t.whatsappAmountAlreadyPaid
        ).length;
        const monthlyBasePkr = riderReportMode === 'monthly' ? rider.monthlySalaryPkr || 0 : 0;
        const walletBonusPkr = riderReportMode === 'monthly' ? rider.walletBonusPkr || 0 : 0;
        const netPayableToRiderPkr =
          deliveryPayPkr + tipsPkr + monthlyBasePkr + walletBonusPkr;

        const payoutId = `rpay-${rider.id}-${riderPeriodKey}`;
        const existingRecord = salaryRecords.find((s) => s.id === payoutId);

        return {
          rider,
          trips,
          tripsCount,
          totalDistanceKm,
          avgDistanceKm,
          deliveryPayPkr,
          tipsPkr,
          codCashPkr,
          onlineCount,
          monthlyBasePkr,
          walletBonusPkr,
          netPayableToRiderPkr,
          payoutId,
          status: existingRecord?.status || 'pending',
          paidAt: existingRecord?.paidAt,
        };
      });

    const filteredTrips = mergedTrips
      .filter((t) => {
        if (!q) return true;
        const riderObj = riders.find((r) => r.id === t.riderId);
        return (
          t.orderCode.toLowerCase().includes(q) ||
          t.restaurantName.toLowerCase().includes(q) ||
          t.dropoffArea.toLowerCase().includes(q) ||
          (riderObj?.name || '').toLowerCase().includes(q) ||
          (riderObj?.loginId || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

    const totalTrips = rows.reduce((s, r) => s + r.tripsCount, 0);
    const totalDistanceKm = Number(
      rows.reduce((s, r) => s + r.totalDistanceKm, 0).toFixed(1)
    );
    const avgDistancePerTripKm =
      totalTrips > 0 ? Number((totalDistanceKm / totalTrips).toFixed(1)) : 0;
    const filteredTripsTotalDistanceKm = Number(
      filteredTrips.reduce((s, t) => s + t.distanceKm, 0).toFixed(1)
    );
    const filteredTripsTotalDeliveryPay = filteredTrips.reduce((s, t) => s + t.deliveryFeePkr, 0);
    const filteredTripsTotalTips = filteredTrips.reduce((s, t) => s + t.tipPkr, 0);

    return {
      rows,
      filteredTrips,
      totalTrips,
      totalDistanceKm,
      avgDistancePerTripKm,
      filteredTripsTotalDistanceKm,
      filteredTripsTotalDeliveryPay,
      filteredTripsTotalTips,
      totalTripPayAndTips: rows.reduce((s, r) => s + r.deliveryPayPkr + r.tipsPkr, 0),
      totalCodCash: rows.reduce((s, r) => s + r.codCashPkr, 0),
      totalPayableToRiders: rows.reduce((s, r) => s + r.netPayableToRiderPkr, 0),
      totalPaidToRiders: rows
        .filter((r) => r.status === 'paid')
        .reduce((s, r) => s + r.netPayableToRiderPkr, 0),
    };
  }, [
    orders,
    riders,
    salaryRecords,
    riderReportMode,
    riderPeriodKey,
    riderStartDate,
    riderEndDate,
    riderReportCity,
    riderReportRiderId,
    riderReportSearch,
    liveDeliveryRates,
  ]);

  const handlePrintAdminRiderReport = () => {
    setAdminPrintOrder(null);
    setAdminPrintDailyReport(false);
    setAdminPrintIndividual(null);
    setAdminPrintRiderReport(true);
    const cleanup = () => {
      setAdminPrintRiderReport(false);
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(() => {
      triggerPrintWithTitle(`HSP-Rider-${riderReportMode}-Payout-Report-${riderPeriodKey}`);
    }, 60);
  };

  const handlePrintAdminOrderSlip = (order: Order) => {
    setAdminPrintDailyReport(false);
    setAdminPrintRiderReport(false);
    setAdminPrintIndividual(null);
    setAdminPrintOrder(order);
    const cleanup = () => {
      setAdminPrintOrder(null);
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(() => {
      triggerPrintWithTitle(`HSP-Invoice-${order.orderCode}`);
    }, 60);
  };

  const handlePrintIndividualReport = (
    type: 'staff' | 'rider' | 'business',
    targetId: string,
    titleSlug: string
  ) => {
    setAdminPrintOrder(null);
    setAdminPrintDailyReport(false);
    setAdminPrintRiderReport(false);
    setAdminPrintIndividual({ type, targetId });
    const cleanup = () => {
      setAdminPrintIndividual(null);
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(() => {
      triggerPrintWithTitle(`HSP-${type}-Report-${titleSlug.replace(/[^a-zA-Z0-9_-]+/g, '-')}`);
    }, 60);
  };

  const pendingWhatsAppOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.orderSource === 'whatsapp' &&
          (o.status === 'placed' || (highlightedWaOrderId && o.id === highlightedWaOrderId))
      ),
    [orders, highlightedWaOrderId]
  );

  const handlePrintAdminDailyReport = () => {
    setAdminPrintOrder(null);
    setAdminPrintRiderReport(false);
    setAdminPrintIndividual(null);
    setAdminPrintDailyReport(true);
    const cleanup = () => {
      setAdminPrintDailyReport(false);
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(() => {
      const bizLabel =
        reportBizId === 'ALL'
          ? 'All-Businesses'
          : (restaurants.find((r) => r.id === reportBizId)?.name || 'Business').replace(/\s+/g, '-');
      triggerPrintWithTitle(
        `HSP-Business-${bizReportMode}-Report-${bizLabel}-${activeBizPeriodKey}`
      );
    }, 60);
  };

  const pendingBusinesses = useMemo(() => {
    const q = businessSearch.trim().toLowerCase();
    return restaurants.filter((r) => {
      if (r.approvalStatus !== 'pending') return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        (r.businessType || '').toLowerCase().includes(q) ||
        (r.ownerEmail || '').toLowerCase().includes(q) ||
        (r.ownerPhone || '').toLowerCase().includes(q) ||
        (r.businessLoginId || '').toLowerCase().includes(q)
      );
    });
  }, [restaurants, businessSearch]);

  const approvedBusinesses = useMemo(() => {
    const q = businessSearch.trim().toLowerCase();
    return restaurants.filter((r) => {
      if (r.approvalStatus && r.approvalStatus !== 'approved') return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        (r.businessType || '').toLowerCase().includes(q) ||
        (r.ownerEmail || '').toLowerCase().includes(q) ||
        (r.ownerPhone || '').toLowerCase().includes(q) ||
        (r.businessLoginId || '').toLowerCase().includes(q)
      );
    });
  }, [restaurants, businessSearch]);

  const filteredRiders = useMemo(() => {
    const q = riderSearch.trim().toLowerCase();
    if (!q) return riders;
    return riders.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        r.vehiclePlate.toLowerCase().includes(q) ||
        (r.loginId || '').toLowerCase().includes(q)
    );
  }, [riders, riderSearch]);

  const filteredPayrollRows = useMemo(() => {
    const q = salarySearch.trim().toLowerCase();
    return payrollRows.filter((row) => {
      if (salaryStatusFilter !== 'ALL' && row.status !== salaryStatusFilter) return false;
      if (!q) return true;
      return (
        row.targetName.toLowerCase().includes(q) ||
        row.roleLabel.toLowerCase().includes(q) ||
        row.targetType.toLowerCase().includes(q)
      );
    });
  }, [payrollRows, salarySearch, salaryStatusFilter]);

  const filteredRiderPayrollRows = useMemo(
    () => filteredPayrollRows.filter((r) => r.targetType === 'rider'),
    [filteredPayrollRows]
  );

  const filteredStaffPayrollRows = useMemo(
    () => filteredPayrollRows.filter((r) => r.targetType === 'staff'),
    [filteredPayrollRows]
  );

  const filteredStaffMembers = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staffMembers;
    return staffMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.city.toLowerCase().includes(q) ||
        m.loginId.toLowerCase().includes(q) ||
        m.phone.toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q)
    );
  }, [staffMembers, staffSearch]);

  const subTabs: Array<{ id: DashSection; label: string; badge?: number; visible: boolean }> = [
    { id: 'overview', label: 'Orders & Analytics', visible: perms.canViewAnalytics || perms.canManageOrders },
    {
      id: 'payments',
      label: 'Business Delivered Payouts & Online',
      badge: businessPayoutSummary.pendingCount > 0 ? businessPayoutSummary.pendingCount : undefined,
      visible: isOwner || perms.canViewAnalytics || perms.canManageOrders,
    },
    {
      id: 'approvals',
      label: 'Businesses & Categories',
      badge: pendingBusinesses.length > 0 ? pendingBusinesses.length : undefined,
      visible: perms.canApproveBusinesses,
    },
    { id: 'rates', label: 'Delivery Rates', visible: isOwner || perms.canManageOrders },
    { id: 'catalog', label: 'Products & WhatsApp', visible: isOwner || perms.canManageOrders },
    { id: 'policies', label: 'Cancellation Policies', visible: isOwner },
    { id: 'publishing', label: 'Play Console', visible: isOwner },
    { id: 'fleet', label: 'Rider Fleet & Earnings', visible: perms.canManageRiders || perms.canEditRiderEarnings },
    { id: 'salary', label: 'Salary Management', visible: perms.canManageSalaries },
    { id: 'staff', label: 'Managers & Staff Access', visible: isOwner },
  ];

  const activeSection: DashSection = subTabs.some((t) => t.id === section && t.visible)
    ? section
    : subTabs.find((t) => t.visible)?.id || 'overview';

  return (
    <div className="space-y-6 pb-24">
      <div
        className={
          adminPrintOrder || adminPrintDailyReport || adminPrintRiderReport || adminPrintIndividual
            ? 'no-print space-y-6'
            : 'space-y-6'
        }
      >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0E0E14] border border-amber-500/30 rounded-2xl p-5 sm:p-6 shadow-xl print-card">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-yellow-400">
              {isOwner
                ? 'App Owner Executive Command'
                : `${activeStaffMember?.role === 'manager' ? 'Manager' : 'Staff'} Workspace · ID ${activeStaffMember?.loginId || ''}`}
            </p>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-extrabold text-emerald-300">
              <ShieldCheck className="w-3 h-3" />
              {isOwner ? 'Full Owner Authority' : 'Owner-Permitted Access'}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white mt-1">
            HSP delivery Control Center
          </h1>
          <p className="text-sm font-semibold text-zinc-400 mt-1">
            Approve stores, grant Rider/Business/Staff Login IDs, manage monthly salaries, and adjust rider wallet earnings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 no-print">
          <button
            type="button"
            onClick={() => triggerPrintWithTitle('HSP-delivery-Operations-Report')}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-extrabold hover:border-amber-400 hover:text-yellow-300 transition-colors"
          >
            <Printer className="w-4 h-4 text-yellow-400" />
            Print Report
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 transition-all"
          >
            <Download className="w-4 h-4" />
            Download CSV
          </button>
        </div>
      </div>

      {/* Dashboard Sub-Navigation Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-print">
        {subTabs
          .filter((t) => t.visible)
          .map((tab) => {
            const active = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap shrink-0 border inline-flex items-center gap-2 transition-all ${
                  active
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 border-yellow-300 shadow-md shadow-amber-500/20'
                    : 'bg-[#0E0E14] text-zinc-300 border-zinc-800 hover:border-amber-400/50 hover:text-yellow-300'
                }`}
              >
                {tab.label}
                {typeof tab.badge === 'number' && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono-tabular font-extrabold ${
                      active ? 'bg-zinc-950 text-yellow-400' : 'bg-yellow-400 text-zinc-950'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
      </div>

      {/* Quick Individual Report Inspector & Printer (Staff Employees, Riders & Business Owners) */}
      <div className="p-4 bg-[#0E0E14] border border-zinc-800 rounded-2xl flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/35 text-yellow-400 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-extrabold text-white">
              Individual Printable Reports (Employee · Rider · Business Owner)
            </p>
            <p className="text-[11px] font-medium text-zinc-400">
              Select any team member, rider, or store owner to check their full individual report and print cleanly.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-zinc-950 p-1 border border-zinc-800">
            {(
              [
                { id: 'rider', label: 'Rider' },
                { id: 'business', label: 'Business Owner' },
                { id: 'staff', label: 'Employee / Staff' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setQuickReportType(opt.id);
                  setQuickReportTargetId('');
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                  quickReportType === opt.id
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <select
            value={
              quickReportTargetId ||
              (quickReportType === 'rider'
                ? riders[0]?.id || ''
                : quickReportType === 'business'
                  ? restaurants[0]?.id || ''
                  : staffMembers[0]?.id || '')
            }
            onChange={(e) => setQuickReportTargetId(e.target.value)}
            className="px-3 py-2 text-xs font-bold rounded-xl bg-zinc-950 border border-zinc-700 text-yellow-300 max-w-[230px]"
          >
            {quickReportType === 'rider' &&
              riders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.loginId || r.city})
                </option>
              ))}
            {quickReportType === 'business' &&
              restaurants.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.businessLoginId || b.city})
                </option>
              ))}
            {quickReportType === 'staff' &&
              staffMembers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.loginId})
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const targetId =
                quickReportTargetId ||
                (quickReportType === 'rider'
                  ? riders[0]?.id || ''
                  : quickReportType === 'business'
                    ? restaurants[0]?.id || ''
                    : staffMembers[0]?.id || '');
              if (!targetId) return;
              setIndividualReportPreview({ type: quickReportType, targetId });
            }}
            className="px-3.5 py-2 rounded-xl bg-zinc-900 border border-amber-500/45 text-yellow-300 text-xs font-extrabold hover:bg-amber-500/15 inline-flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            Check Report
          </button>
          <button
            type="button"
            onClick={() => {
              const targetId =
                quickReportTargetId ||
                (quickReportType === 'rider'
                  ? riders[0]?.id || ''
                  : quickReportType === 'business'
                    ? restaurants[0]?.id || ''
                    : staffMembers[0]?.id || '');
              if (!targetId) return;
              const slug =
                quickReportType === 'rider'
                  ? riders.find((r) => r.id === targetId)?.name || targetId
                  : quickReportType === 'business'
                    ? restaurants.find((b) => b.id === targetId)?.name || targetId
                    : staffMembers.find((s) => s.id === targetId)?.name || targetId;
              handlePrintIndividualReport(quickReportType, targetId, slug);
            }}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Individual
          </button>
        </div>
      </div>

      {/* SECTION 0: ADMIN DELIVERY RATES (CUSTOMERS & RIDERS) */}
      {activeSection === 'rates' && (isOwner || perms.canManageOrders) && (
        <section className="space-y-6">
          <form
            onSubmit={handleSaveDeliveryRates}
            className="p-5 sm:p-6 bg-[#0E0E14] border border-amber-500/35 rounded-2xl space-y-5 shadow-xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 text-yellow-400 flex items-center justify-center shrink-0">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-white">
                    Delivery Rates Control (Customers &amp; Riders)
                  </h2>
                  <p className="text-xs font-semibold text-zinc-400">
                    Update customer delivery charges and rider wallet delivery pay in PKR. Changes apply live to checkout, WhatsApp orders, and rider dispatch.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={savingRates}
                onClick={handleResetDeliveryRates}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-300 hover:border-amber-400 hover:text-yellow-300 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Defaults
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Customer Delivery Charges Card */}
              <div className="p-5 rounded-2xl bg-zinc-950/90 border border-amber-500/30 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-yellow-400">
                      Customer Delivery Charges
                    </p>
                    <p className="text-xs font-semibold text-zinc-400 mt-0.5">
                      Charged to customers at checkout &amp; WhatsApp custom orders
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/35 text-[11px] font-mono-tabular font-extrabold text-yellow-300">
                    Rs. {draftDeliveryRates.customerBaseFeePkr} / {draftDeliveryRates.customerBaseKm} km
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                      Base Distance (km)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="50"
                      required
                      value={custBaseKmInput}
                      onChange={(e) => setCustBaseKmInput(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-900 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                      Base Fee (PKR)
                    </label>
                    <input
                      type="number"
                      step="5"
                      min="0"
                      max="50000"
                      required
                      value={custBaseFeeInput}
                      onChange={(e) => setCustBaseFeeInput(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-900 text-yellow-300 rounded-xl border border-amber-500/40 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                      Extra Per km (PKR)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="10000"
                      required
                      value={custExtraPerKmInput}
                      onChange={(e) => setCustExtraPerKmInput(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-900 text-yellow-300 rounded-xl border border-amber-500/40 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Rider Delivery Pay Card */}
              <div className="p-5 rounded-2xl bg-zinc-950/90 border border-emerald-500/30 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400">
                      Rider Wallet Delivery Pay
                    </p>
                    <p className="text-xs font-semibold text-zinc-400 mt-0.5">
                      Credited to rider wallet per delivery (+ 100% customer tips)
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-[11px] font-mono-tabular font-extrabold text-emerald-300">
                    Rs. {draftDeliveryRates.riderBasePayPkr} / {draftDeliveryRates.riderBaseKm} km
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                      Base Distance (km)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="50"
                      required
                      value={riderBaseKmInput}
                      onChange={(e) => setRiderBaseKmInput(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-900 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                      Base Rider Pay (PKR)
                    </label>
                    <input
                      type="number"
                      step="5"
                      min="0"
                      max="50000"
                      required
                      value={riderBasePayInput}
                      onChange={(e) => setRiderBasePayInput(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-900 text-emerald-300 rounded-xl border border-emerald-500/40 focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 mb-1.5">
                      Extra Per km (PKR)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="10000"
                      required
                      value={riderExtraPerKmInput}
                      onChange={(e) => setRiderExtraPerKmInput(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-900 text-emerald-300 rounded-xl border border-emerald-500/40 focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Live Distance Rate Comparison Preview Table */}
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-extrabold text-white">
                  Live Rate Preview by Distance
                </span>
                <span className="text-[11px] font-semibold text-zinc-400">
                  Preview updates automatically before saving
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-900/70 text-[11px] uppercase tracking-wider text-zinc-400">
                    <tr>
                      <th className="py-2.5 px-4 font-bold">Distance</th>
                      <th className="py-2.5 px-4 font-bold text-right">Customer Delivery Fee</th>
                      <th className="py-2.5 px-4 font-bold text-right">Rider Wallet Pay</th>
                      <th className="py-2.5 px-4 font-bold text-right">Platform Delivery Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80 font-mono-tabular">
                    {[1, 3, 5, 8, 12].map((km) => {
                      const cFee = calculateCustomerDeliveryFeePkr(km, draftDeliveryRates);
                      const rPay = calculateRiderDeliveryEarningPkr(km, draftDeliveryRates);
                      const margin = cFee - rPay;
                      return (
                        <tr key={km} className="hover:bg-zinc-900/40">
                          <td className="py-2.5 px-4 font-bold text-white">{km} km</td>
                          <td className="py-2.5 px-4 text-right font-extrabold text-yellow-300">
                            {formatPkr(cFee)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-extrabold text-emerald-400">
                            {formatPkr(rPay)}
                          </td>
                          <td
                            className={`py-2.5 px-4 text-right font-extrabold ${
                              margin >= 0 ? 'text-zinc-200' : 'text-rose-400'
                            }`}
                          >
                            {margin >= 0 ? `+${formatPkr(margin)}` : formatPkr(margin)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {ratesError && (
              <p className="text-xs font-bold text-rose-400">{ratesError}</p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingRates}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 disabled:opacity-50 inline-flex items-center gap-2 shadow-md shadow-amber-500/20"
              >
                <Save className="w-4 h-4" />
                {savingRates ? 'Saving Delivery Rates...' : 'Save Customer & Rider Delivery Rates'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* SECTION: ORDER CANCELLATION POLICIES (CUSTOMER & BUSINESS OWNER) */}
      {activeSection === 'policies' && isOwner && (
        <AdminPoliciesPanel
          appSettings={appSettings}
          orders={orders}
          onUpdateAppSettings={onUpdateAppSettings}
          onOpenPolicyPreview={onOpenPolicyPreview}
        />
      )}

      {/* SECTION: GOOGLE PLAY CONSOLE PUBLISHING HUB */}
      {activeSection === 'publishing' && isOwner && (
        <PlayConsolePublishingPanel
          appSettings={appSettings}
          onUpdateAppSettings={onUpdateAppSettings}
        />
      )}

      {/* SECTION 1: BUSINESS APPROVALS, CATEGORIES & LOGIN ID ASSIGNMENT */}
      {activeSection === 'approvals' && perms.canApproveBusinesses && (
        <div className="space-y-6">
          {/* Business Categories Manager (Add, Edit & Delete Categories) */}
          <section className="p-5 sm:p-6 bg-[#0E0E14] border border-amber-500/35 rounded-2xl space-y-4 shadow-xl no-print">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 text-yellow-400 flex items-center justify-center shrink-0">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-white">
                    Business Categories Manager ({liveBusinessCategories.length})
                  </h2>
                  <p className="text-xs font-semibold text-zinc-400">
                    Add new business categories or edit existing ones. Changes sync immediately to Customer Marketplace filters and Store Registration.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={savingCategories}
                onClick={handleResetBusinessCategories}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-300 hover:border-amber-400 hover:text-yellow-300 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Defaults
              </button>
            </div>

            <form
              onSubmit={handleAddBusinessCategory}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <input
                type="text"
                maxLength={60}
                value={newCategoryName}
                onChange={(e) => {
                  setNewCategoryName(e.target.value);
                  setCategoryError('');
                }}
                placeholder="Add new business category (e.g., Meat & Butcher, Dairy & Milk, Stationery)..."
                className="flex-1 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-zinc-950 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                disabled={savingCategories || !newCategoryName.trim()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                Add Category
              </button>
            </form>

            {categoryError && (
              <p className="text-xs font-bold text-rose-400">{categoryError}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {liveBusinessCategories.map((cat, idx) => {
                const storeCount = restaurants.filter(
                  (r) => (r.businessType || 'Restaurant') === cat
                ).length;
                const isEditing = editingCategoryIndex === idx;
                return (
                  <div
                    key={`${cat}-${idx}`}
                    className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2"
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 w-full">
                        <input
                          type="text"
                          maxLength={60}
                          value={editingCategoryDraft}
                          onChange={(e) => setEditingCategoryDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleSaveEditedCategory(idx);
                            } else if (e.key === 'Escape') {
                              setEditingCategoryIndex(null);
                              setEditingCategoryDraft('');
                            }
                          }}
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-bold rounded-lg bg-zinc-900 border border-amber-400 text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={savingCategories}
                          onClick={() => handleSaveEditedCategory(idx)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-zinc-950 text-[11px] font-extrabold hover:bg-emerald-400"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategoryIndex(null);
                            setEditingCategoryDraft('');
                          }}
                          className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white"
                          aria-label="Cancel edit"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-white truncate">{cat}</p>
                          <p className="text-[11px] font-mono-tabular text-zinc-500">
                            {storeCount} {storeCount === 1 ? 'store' : 'stores'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategoryIndex(idx);
                              setEditingCategoryDraft(cat);
                              setCategoryError('');
                            }}
                            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-amber-400 hover:text-yellow-300 transition-colors"
                            title="Edit category name"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={savingCategories || liveBusinessCategories.length <= 1}
                            onClick={() => handleDeleteBusinessCategory(idx)}
                            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-rose-500/60 hover:text-rose-400 disabled:opacity-40 transition-colors"
                            title="Remove category"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Search Bar for Businesses */}
          <div className="relative no-print">
            <Search className="w-4 h-4 text-yellow-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={businessSearch}
              onChange={(e) => setBusinessSearch(e.target.value)}
              placeholder="Search businesses by name, category, city, email, phone, or Login ID..."
              className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-[#0E0E14] border border-zinc-800 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
            />
            {businessSearch && (
              <button
                type="button"
                onClick={() => setBusinessSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-yellow-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <section className="bg-[#0E0E14] border border-amber-500/30 rounded-2xl overflow-hidden shadow-xl print-card">
            <div className="p-5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center shrink-0">
                  <Store className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-white">
                    Pending Business Registrations ({pendingBusinesses.length})
                  </h2>
                  <p className="text-xs font-semibold text-zinc-400">
                    Assign a Business Login ID when approving so the store owner can open their account.
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-300">
                {approvedBusinesses.length} Approved Businesses
              </span>
            </div>

            {pendingBusinesses.length === 0 ? (
              <div className="p-8 text-center text-xs sm:text-sm font-semibold text-zinc-400">
                No businesses awaiting approval right now.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {pendingBusinesses.map((biz, idx) => {
                  const suggestedId =
                    bizLoginInputs[biz.id] ??
                    biz.businessLoginId ??
                    `BIZ-${107 + approvedBusinesses.length + idx}`;
                  return (
                    <div
                      key={biz.id}
                      className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-16 h-12 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0">
                          <FoodImage src={biz.coverImage} alt={biz.name} />
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-extrabold text-white truncate">{biz.name}</h3>
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-[11px] font-bold text-yellow-300">
                              {biz.businessType || 'Business'}
                            </span>
                            <span className="text-xs font-bold text-amber-400">{biz.city}</span>
                          </div>
                          <p className="text-xs font-semibold text-zinc-400 truncate">
                            {biz.cuisine} · {biz.address}
                            {biz.ownerPhone ? ` · Owner: ${biz.ownerPhone}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0 no-print">
                        <input
                          type="text"
                          value={suggestedId}
                          onChange={(e) =>
                            setBizLoginInputs((prev) => ({
                              ...prev,
                              [biz.id]: e.target.value.toUpperCase(),
                            }))
                          }
                          placeholder="BIZ-107"
                          className="w-28 px-3 py-2 rounded-xl bg-zinc-900 border border-amber-500/40 font-mono-tabular text-xs font-extrabold uppercase text-yellow-300 focus:outline-none focus:border-yellow-400"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateBusinessApproval(biz.id, 'approved', suggestedId.trim().toUpperCase())
                          }
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 text-xs font-extrabold hover:bg-emerald-400 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Approve &amp; Grant ID
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateBusinessApproval(biz.id, 'rejected')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 text-xs font-extrabold hover:bg-rose-500/25 transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </button>
                        {(isOwner || perms.canApproveBusinesses) &&
                          (confirmDeleteBizId === biz.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={async () => {
                                  await onDeleteBusiness(biz.id);
                                  setConfirmDeleteBizId(null);
                                }}
                                className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-extrabold hover:bg-rose-500 transition-colors"
                              >
                                Confirm Remove
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteBizId(null)}
                                className="px-2.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-bold hover:text-white"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteBizId(biz.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-extrabold hover:bg-rose-600 hover:text-white transition-colors"
                              title="Delete business from app"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Existing Approved Businesses Directory with Full Owner Edit & Delete */}
          <section className="bg-[#0E0E14] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-zinc-800">
              <h3 className="text-base font-extrabold text-white">
                Registered Businesses &amp; Owner-Granted Login IDs ({approvedBusinesses.length})
              </h3>
              <p className="text-xs font-semibold text-zinc-400">
                Edit any business profile, owner email, phone, Login ID, or delete a store from the platform.
              </p>
            </div>
            <div className="divide-y divide-zinc-800">
              {approvedBusinesses.map((biz, idx) => {
                const draftId =
                  bizLoginInputs[biz.id] ?? biz.businessLoginId ?? `BIZ-${101 + idx}`;
                const isEditingBiz = editingBizId === biz.id;
                return (
                  <div key={biz.id} className="p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-white truncate">{biz.name}</p>
                        <p className="text-xs text-zinc-400">
                          {biz.businessType || 'Restaurant'} · {biz.city}
                          {biz.ownerEmail ? ` · ${biz.ownerEmail}` : ''}
                          {biz.ownerPhone ? ` · ${biz.ownerPhone}` : ''}
                        </p>
                        {(formatTimeRange(biz.businessOpenTime, biz.businessCloseTime) ||
                          formatTimeRange(biz.deliveryOpenTime, biz.deliveryCloseTime)) && (
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] font-semibold">
                            {formatTimeRange(biz.businessOpenTime, biz.businessCloseTime) && (
                              <span className="inline-flex items-center gap-1 text-emerald-300">
                                <Clock className="w-3 h-3" />
                                Shop: {formatTimeRange(biz.businessOpenTime, biz.businessCloseTime)}
                              </span>
                            )}
                            {formatTimeRange(biz.deliveryOpenTime, biz.deliveryCloseTime) && (
                              <span className="inline-flex items-center gap-1 text-amber-300">
                                <Bike className="w-3 h-3" />
                                Delivery: {formatTimeRange(biz.deliveryOpenTime, biz.deliveryCloseTime)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 no-print">
                        <input
                          type="text"
                          value={draftId}
                          onChange={(e) =>
                            setBizLoginInputs((prev) => ({
                              ...prev,
                              [biz.id]: e.target.value.toUpperCase(),
                            }))
                          }
                          className="w-28 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 font-mono-tabular text-xs font-extrabold uppercase text-yellow-300 focus:outline-none focus:border-amber-400"
                        />
                        <button
                          type="button"
                          onClick={() => onAssignBusinessLoginId(biz.id, draftId.trim().toUpperCase())}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-xs font-extrabold text-yellow-300 hover:bg-amber-500 hover:text-zinc-950 transition-colors"
                        >
                          Save ID
                        </button>
                        {isOwner && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                if (isEditingBiz) {
                                  setEditingBizId(null);
                                } else {
                                  setEditingBizId(biz.id);
                                  setBizDraft({
                                    name: biz.name,
                                    urduName: biz.urduName || '',
                                    businessType: biz.businessType || 'Restaurant',
                                    cuisine: biz.cuisine,
                                    city: biz.city,
                                    address: biz.address,
                                    ownerEmail: biz.ownerEmail || '',
                                    ownerPhone: biz.ownerPhone || '',
                                    businessLoginId: biz.businessLoginId || draftId,
                                    approvalStatus: biz.approvalStatus || 'approved',
                                    deliveryTimeMin: biz.deliveryTimeMin,
                                    minOrderPkr: biz.minOrderPkr,
                                    isOpen: biz.isOpen,
                                    businessOpenTime: biz.businessOpenTime || '09:00',
                                    businessCloseTime: biz.businessCloseTime || '23:00',
                                    deliveryOpenTime: biz.deliveryOpenTime || '10:00',
                                    deliveryCloseTime: biz.deliveryCloseTime || '22:30',
                                  });
                                }
                              }}
                              className="p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-amber-300 hover:border-yellow-400 transition-colors"
                              title="Edit business details"
                            >
                              {isEditingBiz ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                            </button>
                            {confirmDeleteBizId === biz.id ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await onDeleteBusiness(biz.id);
                                    setConfirmDeleteBizId(null);
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-extrabold hover:bg-rose-500 transition-colors"
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteBizId(null)}
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-bold hover:text-white"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteBizId(biz.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-extrabold hover:bg-rose-600 hover:text-white transition-colors"
                                title="Delete business from app"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {isOwner && isEditingBiz && (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          await onUpdateBusinessDetails(biz.id, bizDraft);
                          setEditingBizId(null);
                        }}
                        className="p-4 rounded-xl bg-zinc-900/90 border border-amber-500/35 space-y-3 no-print"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                          <input
                            type="text"
                            required
                            value={bizDraft.name || ''}
                            onChange={(e) => setBizDraft((p) => ({ ...p, name: e.target.value }))}
                            placeholder="Business Name"
                            className="px-3 py-2 text-xs font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                          />
                          <select
                            value={bizDraft.businessType || 'Restaurant'}
                            onChange={(e) =>
                              setBizDraft((p) => ({
                                ...p,
                                businessType: e.target.value as BusinessType,
                              }))
                            }
                            className="px-3 py-2 text-xs font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                          >
                            {Array.from(
                              new Set([
                                ...liveBusinessCategories,
                                ...(bizDraft.businessType ? [bizDraft.businessType] : []),
                              ])
                            ).map((bt) => (
                              <option key={bt} value={bt}>
                                {bt}
                              </option>
                            ))}
                          </select>
                          <select
                            value={bizDraft.city || 'Hasilpur'}
                            onChange={(e) => setBizDraft((p) => ({ ...p, city: e.target.value }))}
                            className="px-3 py-2 text-xs font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                          >
                            {PAKISTAN_CITIES.map((c) => (
                              <option key={c.id} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={bizDraft.businessLoginId || ''}
                            onChange={(e) =>
                              setBizDraft((p) => ({
                                ...p,
                                businessLoginId: e.target.value.toUpperCase(),
                              }))
                            }
                            placeholder="Login ID"
                            className="px-3 py-2 text-xs font-mono-tabular font-extrabold uppercase bg-zinc-950 text-yellow-300 rounded-lg border border-amber-500/40"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                          <input
                            type="email"
                            value={bizDraft.ownerEmail || ''}
                            onChange={(e) =>
                              setBizDraft((p) => ({ ...p, ownerEmail: e.target.value.toLowerCase() }))
                            }
                            placeholder="Owner Approved Email"
                            className="px-3 py-2 text-xs font-semibold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                          />
                          <input
                            type="tel"
                            value={bizDraft.ownerPhone || ''}
                            onChange={(e) =>
                              setBizDraft((p) => ({ ...p, ownerPhone: e.target.value }))
                            }
                            placeholder="Owner Phone"
                            className="px-3 py-2 text-xs font-mono-tabular font-semibold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                          />
                          <input
                            type="text"
                            value={bizDraft.cuisine || ''}
                            onChange={(e) => setBizDraft((p) => ({ ...p, cuisine: e.target.value }))}
                            placeholder="Tags / Specialty"
                            className="px-3 py-2 text-xs font-semibold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                          />
                          <select
                            value={bizDraft.approvalStatus || 'approved'}
                            onChange={(e) =>
                              setBizDraft((p) => ({
                                ...p,
                                approvalStatus: e.target.value as BusinessApprovalStatus,
                              }))
                            }
                            className="px-3 py-2 text-xs font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                          >
                            <option value="approved">Approved</option>
                            <option value="pending">Pending</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-bold text-zinc-400 mb-1">
                              Business Open Time
                            </label>
                            <input
                              type="time"
                              value={bizDraft.businessOpenTime || '09:00'}
                              onChange={(e) =>
                                setBizDraft((p) => ({ ...p, businessOpenTime: e.target.value }))
                              }
                              className="w-full px-3 py-2 text-xs font-mono-tabular font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-zinc-400 mb-1">
                              Business Close Time
                            </label>
                            <input
                              type="time"
                              value={bizDraft.businessCloseTime || '23:00'}
                              onChange={(e) =>
                                setBizDraft((p) => ({ ...p, businessCloseTime: e.target.value }))
                              }
                              className="w-full px-3 py-2 text-xs font-mono-tabular font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-amber-300 mb-1">
                              Delivery Open Time
                            </label>
                            <input
                              type="time"
                              value={bizDraft.deliveryOpenTime || '10:00'}
                              onChange={(e) =>
                                setBizDraft((p) => ({ ...p, deliveryOpenTime: e.target.value }))
                              }
                              className="w-full px-3 py-2 text-xs font-mono-tabular font-bold bg-zinc-950 text-yellow-300 rounded-lg border border-amber-500/40"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-amber-300 mb-1">
                              Delivery Close Time
                            </label>
                            <input
                              type="time"
                              value={bizDraft.deliveryCloseTime || '22:30'}
                              onChange={(e) =>
                                setBizDraft((p) => ({ ...p, deliveryCloseTime: e.target.value }))
                              }
                              className="w-full px-3 py-2 text-xs font-mono-tabular font-bold bg-zinc-950 text-yellow-300 rounded-lg border border-amber-500/40"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                          <input
                            type="text"
                            value={bizDraft.address || ''}
                            onChange={(e) => setBizDraft((p) => ({ ...p, address: e.target.value }))}
                            placeholder="Full Address"
                            className="flex-1 min-w-[200px] px-3 py-2 text-xs font-semibold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                          />
                          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-200 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={bizDraft.isOpen !== false}
                              onChange={(e) =>
                                setBizDraft((p) => ({ ...p, isOpen: e.target.checked }))
                              }
                              className="accent-yellow-400 w-4 h-4"
                            />
                            Open Now
                          </label>
                          <button
                            type="submit"
                            className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold inline-flex items-center gap-1.5"
                          >
                            <Save className="w-3.5 h-3.5" />
                            Save Business Details
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* SECTION 2: RIDER FLEET & WALLET EARNINGS EDITOR */}
      {activeSection === 'fleet' && (perms.canManageRiders || perms.canEditRiderEarnings) && (
        <section className="bg-[#0E0E14] border border-amber-500/30 rounded-2xl overflow-hidden shadow-xl print-card">
          <div className="p-5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center shrink-0">
                <Bike className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Rider Fleet, Login IDs &amp; Wallet Adjustments ({filteredRiders.length} Riders)
                </h2>
                <p className="text-xs font-semibold text-zinc-400">
                  Issue Rider Login IDs and adjust rider wallet bonuses or monthly base salaries.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 no-print">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-yellow-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={riderSearch}
                  onChange={(e) => setRiderSearch(e.target.value)}
                  placeholder="Search rider, city, plate, ID..."
                  className="pl-8 pr-3 py-2 text-xs font-semibold rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400 w-52"
                />
              </div>
              {perms.canManageRiders && (
                <button
                  type="button"
                  onClick={() => setShowAddRider((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold no-print"
                >
                  <UserPlus className="w-4 h-4" />
                  {showAddRider ? 'Hide Rider Form' : 'Add Rider'}
                </button>
              )}
            </div>
          </div>

          {showAddRider && perms.canManageRiders && (
            <form
              onSubmit={handleCreateRider}
              className="p-5 bg-zinc-900/60 border-b border-zinc-800 space-y-4 no-print"
            >
              <h3 className="text-sm font-extrabold text-yellow-400">
                Register Rider &amp; Grant Login ID
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1.5">Rider Full Name</label>
                  <input
                    type="text"
                    required
                    value={riderName}
                    onChange={(e) => setRiderName(e.target.value)}
                    placeholder="e.g., Bilal Mehmood"
                    className="w-full px-3.5 py-2.5 text-sm font-semibold bg-zinc-950 text-white placeholder:text-zinc-500 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1.5">Approved Email ID</label>
                  <input
                    type="email"
                    required
                    value={riderEmail}
                    onChange={(e) => setRiderEmail(e.target.value)}
                    placeholder="rider@gmail.com"
                    className="w-full px-3.5 py-2.5 text-sm font-semibold bg-zinc-950 text-white placeholder:text-zinc-500 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1.5">Owner-Issued Login ID</label>
                  <input
                    type="text"
                    required
                    value={riderLoginId}
                    onChange={(e) => setRiderLoginId(e.target.value.toUpperCase())}
                    placeholder="RDR-107"
                    className="w-full px-3.5 py-2.5 text-sm font-mono-tabular font-extrabold uppercase bg-zinc-950 text-yellow-300 rounded-xl border border-amber-500/40 focus:outline-none focus:border-yellow-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1.5">Mobile Number (PK)</label>
                  <input
                    type="tel"
                    required
                    value={riderPhone}
                    onChange={(e) => setRiderPhone(e.target.value)}
                    placeholder="+92 300 5512345"
                    className="w-full px-3.5 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-950 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1.5">Monthly Salary (PKR)</label>
                  <input
                    type="number"
                    required
                    min={5000}
                    value={riderSalary}
                    onChange={(e) => setRiderSalary(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-950 text-emerald-400 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1.5">City</label>
                  <select
                    value={riderCity}
                    onChange={(e) => setRiderCity(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-bold bg-zinc-950 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                  >
                    {PAKISTAN_CITIES.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1.5">Vehicle</label>
                  <select
                    value={riderVehicle}
                    onChange={(e) => setRiderVehicle(e.target.value as RiderVehicleType)}
                    className="w-full px-3.5 py-2.5 text-sm font-bold bg-zinc-950 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                  >
                    <option value="motorbike">Motorbike</option>
                    <option value="car">Car / Van</option>
                    <option value="bicycle">Bicycle</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1.5">Number Plate</label>
                  <input
                    type="text"
                    required
                    value={riderPlate}
                    onChange={(e) => setRiderPlate(e.target.value)}
                    placeholder="BWP-7860"
                    className="w-full px-3.5 py-2.5 text-sm font-mono-tabular font-bold uppercase bg-zinc-950 text-amber-300 placeholder:text-zinc-500 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingRider}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-sm font-extrabold hover:brightness-105 disabled:opacity-50 inline-flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
                >
                  <UserPlus className="w-4 h-4" />
                  {savingRider ? 'Adding Rider...' : 'Add Rider & Issue ID'}
                </button>
              </div>
            </form>
          )}

          {/* Riders Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-zinc-900/70 border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
                  <th className="py-3.5 px-4 font-extrabold">Rider &amp; Login ID</th>
                  <th className="py-3.5 px-4 font-extrabold">Phone &amp; City</th>
                  <th className="py-3.5 px-4 font-extrabold">Vehicle</th>
                  <th className="py-3.5 px-4 font-extrabold text-right">Trips</th>
                  <th className="py-3.5 px-4 font-extrabold">Wallet Adj. (+/- PKR)</th>
                  <th className="py-3.5 px-4 font-extrabold">Status</th>
                  <th className="py-3.5 px-4 font-extrabold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {filteredRiders.map((rider) => {
                  const bonusDraft =
                    bonusEdits[rider.id] ?? String(rider.walletBonusPkr ?? 0);
                  const isEditingThisRider = editingRiderId === rider.id;
                  return (
                    <React.Fragment key={rider.id}>
                      <tr className="hover:bg-zinc-900/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-extrabold text-white">{rider.name}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 font-mono-tabular text-[11px] font-extrabold text-yellow-300">
                              <KeyRound className="w-3 h-3" />
                              {rider.loginId || 'No ID'}
                            </span>
                            {rider.email && (
                              <span className="text-[11px] text-zinc-400">{rider.email}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs">
                          <div className="font-mono-tabular font-bold text-zinc-200">{rider.phone}</div>
                          <div className="text-zinc-400 font-semibold">{rider.city}</div>
                        </td>
                        <td className="py-3.5 px-4 text-xs font-bold text-zinc-300 whitespace-nowrap">
                          <span className="capitalize">{rider.vehicleType}</span>
                          <span className="mx-1.5 text-zinc-600">·</span>
                          <span className="font-mono-tabular font-extrabold text-amber-300">
                            {rider.vehiclePlate}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono-tabular font-bold text-zinc-200">
                          {rider.completedDeliveries} ({rider.rating.toFixed(1)}★)
                        </td>
                        <td className="py-3.5 px-4">
                          {perms.canEditRiderEarnings ? (
                            <div className="flex items-center gap-1.5 no-print">
                              <input
                                type="number"
                                value={bonusDraft}
                                onChange={(e) =>
                                  setBonusEdits((prev) => ({ ...prev, [rider.id]: e.target.value }))
                                }
                                className="w-24 px-2.5 py-1.5 text-xs font-mono-tabular font-bold rounded-lg bg-zinc-950 border border-zinc-700 text-yellow-300 focus:outline-none focus:border-amber-400"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateRiderCompensation(rider.id, {
                                    walletBonusPkr: Math.round(Number(bonusDraft) || 0),
                                  })
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-yellow-300 text-[11px] font-extrabold hover:bg-amber-500 hover:text-zinc-950 transition-colors"
                                title="Save rider wallet adjustment"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <span className="font-mono-tabular text-xs font-bold text-zinc-300">
                              {formatPkr(rider.walletBonusPkr || 0)}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <select
                            value={rider.status}
                            disabled={!perms.canManageRiders}
                            onChange={(e) =>
                              onUpdateRiderStatus(rider.id, e.target.value as RiderStatus)
                            }
                            className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-zinc-700 bg-zinc-900 text-white focus:outline-none focus:border-amber-400"
                          >
                            <option value="available">Available</option>
                            <option value="on_delivery">On Delivery</option>
                            <option value="offline">Offline</option>
                          </select>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {perms.canManageRiders && (
                            <div className="inline-flex items-center gap-1">
                              {isOwner && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isEditingThisRider) {
                                      setEditingRiderId(null);
                                    } else {
                                      setEditingRiderId(rider.id);
                                      setRiderDraft({
                                        name: rider.name,
                                        email: rider.email || '',
                                        phone: rider.phone,
                                        cnic: rider.cnic || '',
                                        city: rider.city,
                                        vehicleType: rider.vehicleType,
                                        vehiclePlate: rider.vehiclePlate,
                                        loginId: rider.loginId || '',
                                        monthlySalaryPkr: rider.monthlySalaryPkr ?? 25000,
                                      });
                                    }
                                  }}
                                  className="p-2 rounded-lg text-amber-300 hover:bg-amber-500/15 transition-colors"
                                  title="Edit rider details"
                                >
                                  {isEditingThisRider ? (
                                    <X className="w-4 h-4" />
                                  ) : (
                                    <Edit3 className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onDeleteRider(rider.id)}
                                className="p-2 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                aria-label={`Remove ${rider.name}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {isOwner && isEditingThisRider && (
                        <tr className="bg-zinc-900/70 no-print">
                          <td colSpan={7} className="p-4">
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                await onUpdateRiderDetails(rider.id, riderDraft);
                                setEditingRiderId(null);
                              }}
                              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5"
                            >
                              <input
                                type="text"
                                required
                                value={riderDraft.name || ''}
                                onChange={(e) =>
                                  setRiderDraft((p) => ({ ...p, name: e.target.value }))
                                }
                                placeholder="Full Name"
                                className="px-3 py-2 text-xs font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                              />
                              <input
                                type="email"
                                value={riderDraft.email || ''}
                                onChange={(e) =>
                                  setRiderDraft((p) => ({
                                    ...p,
                                    email: e.target.value.toLowerCase(),
                                  }))
                                }
                                placeholder="Approved Email"
                                className="px-3 py-2 text-xs font-semibold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                              />
                              <input
                                type="text"
                                required
                                value={riderDraft.loginId || ''}
                                onChange={(e) =>
                                  setRiderDraft((p) => ({
                                    ...p,
                                    loginId: e.target.value.toUpperCase(),
                                  }))
                                }
                                placeholder="Login ID"
                                className="px-3 py-2 text-xs font-mono-tabular font-extrabold uppercase bg-zinc-950 text-yellow-300 rounded-lg border border-amber-500/40"
                              />
                              <input
                                type="tel"
                                required
                                value={riderDraft.phone || ''}
                                onChange={(e) =>
                                  setRiderDraft((p) => ({ ...p, phone: e.target.value }))
                                }
                                placeholder="Phone"
                                className="px-3 py-2 text-xs font-mono-tabular font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                              />
                              <select
                                value={riderDraft.city || 'Hasilpur'}
                                onChange={(e) =>
                                  setRiderDraft((p) => ({ ...p, city: e.target.value }))
                                }
                                className="px-3 py-2 text-xs font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                              >
                                {PAKISTAN_CITIES.map((c) => (
                                  <option key={c.id} value={c.name}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                required
                                value={riderDraft.vehiclePlate || ''}
                                onChange={(e) =>
                                  setRiderDraft((p) => ({
                                    ...p,
                                    vehiclePlate: e.target.value.toUpperCase(),
                                  }))
                                }
                                placeholder="Number Plate"
                                className="px-3 py-2 text-xs font-mono-tabular font-bold uppercase bg-zinc-950 text-amber-300 rounded-lg border border-zinc-700"
                              />
                              <input
                                type="number"
                                min={0}
                                value={riderDraft.monthlySalaryPkr ?? 25000}
                                onChange={(e) =>
                                  setRiderDraft((p) => ({
                                    ...p,
                                    monthlySalaryPkr: Math.max(0, Number(e.target.value) || 0),
                                  }))
                                }
                                placeholder="Monthly Salary"
                                className="px-3 py-2 text-xs font-mono-tabular font-bold bg-zinc-950 text-emerald-400 rounded-lg border border-zinc-700"
                              />
                              <button
                                type="submit"
                                className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold inline-flex items-center justify-center gap-1.5"
                              >
                                <Save className="w-3.5 h-3.5" />
                                Save Rider
                              </button>
                            </form>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Riders Daily & Monthly Payout Report to Pay Rider */}
          <div className="bg-[#0E0E14] border border-amber-500/35 rounded-2xl overflow-hidden shadow-xl space-y-0">
            <div className="p-5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Riders Daily &amp; Monthly Report — Amount to Pay Rider ({riderPeriodLabel})
                </h2>
                <p className="text-xs font-semibold text-zinc-400">
                  {formatRiderRateSummary(liveDeliveryRates)} + customer tips
                  {riderReportMode === 'monthly'
                    ? ' + Fixed Monthly Salary & Wallet Bonus'
                    : ' (Daily trip payout)'}
                  . Online orders contribute Rs. 0 Cash collected.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 no-print">
                <div className="inline-flex rounded-xl bg-zinc-950 p-1 border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setRiderReportMode('daily')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                      riderReportMode === 'daily'
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Daily Report
                  </button>
                  <button
                    type="button"
                    onClick={() => setRiderReportMode('monthly')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                      riderReportMode === 'monthly'
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Monthly Report
                  </button>
                  <button
                    type="button"
                    onClick={() => setRiderReportMode('range')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                      riderReportMode === 'range'
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Custom Range
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const summaryRows: Array<Array<string | number>> = riderReportData.rows.map(
                      (r) => [
                        r.rider.name,
                        r.rider.loginId || '',
                        r.rider.city,
                        riderPeriodKey,
                        r.tripsCount,
                        r.totalDistanceKm.toFixed(1),
                        r.avgDistanceKm.toFixed(1),
                        r.deliveryPayPkr,
                        r.tipsPkr,
                        r.monthlyBasePkr + r.walletBonusPkr,
                        r.netPayableToRiderPkr,
                        r.codCashPkr,
                        r.status.toUpperCase(),
                      ]
                    );
                    summaryRows.push([
                      'FLEET TOTAL',
                      '',
                      riderReportCity === 'ALL' ? 'All Cities' : riderReportCity,
                      riderPeriodKey,
                      riderReportData.totalTrips,
                      riderReportData.totalDistanceKm.toFixed(1),
                      riderReportData.avgDistancePerTripKm.toFixed(1),
                      riderReportData.rows.reduce((s, r) => s + r.deliveryPayPkr, 0),
                      riderReportData.rows.reduce((s, r) => s + r.tipsPkr, 0),
                      riderReportData.rows.reduce(
                        (s, r) => s + r.monthlyBasePkr + r.walletBonusPkr,
                        0
                      ),
                      riderReportData.totalPayableToRiders,
                      riderReportData.totalCodCash,
                      'SUMMARY',
                    ]);
                    downloadCsv(
                      `hsp-rider-${riderReportMode}-payout-${riderPeriodKey}.csv`,
                      [
                        'Rider',
                        'Login ID',
                        'City',
                        'Period',
                        'Delivered Trips',
                        'Total Distance (km)',
                        'Avg KM / Order',
                        'Delivery Pay (PKR)',
                        'Tips (PKR)',
                        'Monthly Base+Bonus (PKR)',
                        'Net Payable to Rider (PKR)',
                        'COD Cash Collected (PKR)',
                        'Status',
                      ],
                      summaryRows
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-amber-400 hover:text-yellow-300"
                >
                  <Download className="w-3.5 h-3.5" />
                  Rider Report CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const tripRows: Array<Array<string | number>> =
                      riderReportData.filteredTrips.map((t) => {
                        const rObj = riders.find((r) => r.id === t.riderId);
                        return [
                          t.orderCode,
                          t.completedAt,
                          rObj?.name || t.riderId,
                          rObj?.loginId || '',
                          t.restaurantName,
                          t.dropoffArea,
                          t.city,
                          t.distanceKm.toFixed(1),
                          t.paymentMethod,
                          t.deliveryFeePkr,
                          t.tipPkr,
                          t.deliveryFeePkr + t.tipPkr,
                        ];
                      });
                    tripRows.push([
                      'TOTAL',
                      riderPeriodLabel,
                      `${riderReportData.filteredTrips.length} delivered orders`,
                      '',
                      '',
                      `Avg ${
                        riderReportData.filteredTrips.length > 0
                          ? (
                              riderReportData.filteredTripsTotalDistanceKm /
                              riderReportData.filteredTrips.length
                            ).toFixed(1)
                          : '0.0'
                      } km/order`,
                      riderReportCity === 'ALL' ? 'All Cities' : riderReportCity,
                      riderReportData.filteredTripsTotalDistanceKm.toFixed(1),
                      'ALL',
                      riderReportData.filteredTripsTotalDeliveryPay,
                      riderReportData.filteredTripsTotalTips,
                      riderReportData.filteredTripsTotalDeliveryPay +
                        riderReportData.filteredTripsTotalTips,
                    ]);
                    downloadCsv(
                      `hsp-rider-${riderReportMode}-trips-km-${riderPeriodKey}.csv`,
                      [
                        'Order Code',
                        'Completed At',
                        'Rider',
                        'Login ID',
                        'Store / Business',
                        'Drop-off Area',
                        'City',
                        'Distance (km)',
                        'Payment Method',
                        'Delivery Pay (PKR)',
                        'Tip (PKR)',
                        'Rider Total (PKR)',
                      ],
                      tripRows
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-amber-400 hover:text-yellow-300"
                >
                  <Route className="w-3.5 h-3.5 text-yellow-400" />
                  Trips &amp; KM CSV
                </button>
                <button
                  type="button"
                  onClick={handlePrintAdminRiderReport}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Rider Payout Report
                </button>
              </div>
            </div>

            {/* Filters + Summary KPIs */}
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 space-y-4">
              <div className="flex flex-wrap items-center gap-2.5 no-print">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-yellow-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={riderReportSearch}
                    onChange={(e) => setRiderReportSearch(e.target.value)}
                    placeholder="Search rider, Login ID, order code, or store..."
                    className="w-full pl-9 pr-3 py-2 text-xs font-semibold bg-zinc-950 text-white placeholder:text-zinc-500 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <select
                  value={riderReportRiderId}
                  onChange={(e) => setRiderReportRiderId(e.target.value)}
                  className="px-3 py-2 text-xs font-bold rounded-xl bg-zinc-950 border border-zinc-700 text-yellow-300"
                >
                  <option value="ALL">All Riders</option>
                  {riders.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.loginId})
                    </option>
                  ))}
                </select>
                <select
                  value={riderReportCity}
                  onChange={(e) => setRiderReportCity(e.target.value)}
                  className="px-3 py-2 text-xs font-bold rounded-xl bg-zinc-950 border border-zinc-700 text-white"
                >
                  <option value="ALL">All Cities</option>
                  {PAKISTAN_CITIES.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {riderReportMode === 'range' ? (
                  <DateRangePicker
                    startDate={riderStartDate}
                    endDate={riderEndDate}
                    onChange={({ startDate, endDate }) => {
                      setRiderStartDate(startDate);
                      setRiderEndDate(endDate);
                    }}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-400" />
                    {riderReportMode === 'daily' ? (
                      <input
                        type="date"
                        value={riderReportDate}
                        onChange={(e) => setRiderReportDate(e.target.value)}
                        className="px-3 py-2 text-xs font-mono-tabular font-bold bg-zinc-950 text-white rounded-xl border border-zinc-700"
                      />
                    ) : (
                      <input
                        type="month"
                        value={riderReportMonth}
                        onChange={(e) => setRiderReportMonth(e.target.value)}
                        className="px-3 py-2 text-xs font-mono-tabular font-bold bg-zinc-950 text-white rounded-xl border border-zinc-700"
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
                  <p className="text-[11px] font-bold text-zinc-400 uppercase">Delivered Trips</p>
                  <p className="text-lg font-extrabold font-mono-tabular text-white mt-0.5">
                    {riderReportData.totalTrips} trips
                  </p>
                  <p className="text-[10px] text-zinc-500 font-semibold">
                    {riderPeriodLabel}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-amber-500/40">
                  <p className="text-[11px] font-bold text-yellow-300 uppercase inline-flex items-center gap-1">
                    <Route className="w-3.5 h-3.5 text-yellow-400" />
                    Total KM Traveled
                  </p>
                  <p className="text-lg font-extrabold font-mono-tabular text-yellow-300 mt-0.5">
                    {riderReportData.totalDistanceKm.toFixed(1)} km
                  </p>
                  <p className="text-[10px] text-zinc-400 font-mono-tabular font-bold">
                    Avg {riderReportData.avgDistancePerTripKm.toFixed(1)} km / order
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
                  <p className="text-[11px] font-bold text-zinc-400 uppercase">Trip Pay + Tips</p>
                  <p className="text-lg font-extrabold font-mono-tabular text-emerald-400 mt-0.5">
                    {formatPkr(riderReportData.totalTripPayAndTips)}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
                  <p className="text-[11px] font-bold text-zinc-400 uppercase">COD Cash (Online Rs. 0)</p>
                  <p className="text-lg font-extrabold font-mono-tabular text-amber-300 mt-0.5">
                    {formatPkr(riderReportData.totalCodCash)}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-amber-500/40 col-span-2 lg:col-span-1">
                  <p className="text-[11px] font-bold text-yellow-300 uppercase">
                    Total Payable to Riders
                  </p>
                  <p className="text-lg font-extrabold font-mono-tabular text-yellow-400 mt-0.5">
                    {formatPkr(riderReportData.totalPayableToRiders)}
                  </p>
                  <p className="text-[10px] text-emerald-400 font-bold">
                    Paid: {formatPkr(riderReportData.totalPaidToRiders)}
                  </p>
                </div>
              </div>
            </div>

            {/* Per-Rider Payout & Distance Summary Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-900/70 border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
                    <th className="py-3 px-4 font-extrabold">Rider &amp; Login ID</th>
                    <th className="py-3 px-4 font-extrabold text-right">Trips</th>
                    <th className="py-3 px-4 font-extrabold text-right">Total KM</th>
                    <th className="py-3 px-4 font-extrabold text-right">Delivery Pay + Tips</th>
                    {riderReportMode === 'monthly' && (
                      <th className="py-3 px-4 font-extrabold text-right">Base + Bonus</th>
                    )}
                    <th className="py-3 px-4 font-extrabold text-right">COD Cash</th>
                    <th className="py-3 px-4 font-extrabold text-right">Amount to Pay Rider</th>
                    <th className="py-3 px-4 font-extrabold">Payout Status</th>
                    <th className="py-3 px-4 font-extrabold text-right no-print">Pay Rider</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {riderReportData.rows.map((row) => {
                    const isPaid = row.status === 'paid';
                    return (
                      <tr key={row.rider.id} className="hover:bg-zinc-900/40">
                        <td className="py-3 px-4">
                          <p className="font-extrabold text-white">{row.rider.name}</p>
                          <p className="text-[11px] text-zinc-400">
                            {row.rider.city} · ID{' '}
                            <span className="font-mono-tabular text-yellow-300">
                              {row.rider.loginId}
                            </span>
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular whitespace-nowrap">
                          <p className="font-bold text-white">{row.tripsCount} trips</p>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular whitespace-nowrap">
                          <p className="font-extrabold text-yellow-300">
                            {row.totalDistanceKm.toFixed(1)} km
                          </p>
                          <p className="text-[10px] text-zinc-400">
                            Avg {row.avgDistanceKm.toFixed(1)} km/order
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular whitespace-nowrap">
                          <p className="font-bold text-emerald-400">
                            {formatPkr(row.deliveryPayPkr + row.tipsPkr)}
                          </p>
                          <p className="text-[10px] text-zinc-400">
                            Pay {formatPkr(row.deliveryPayPkr)} · Tip {formatPkr(row.tipsPkr)}
                          </p>
                        </td>
                        {riderReportMode === 'monthly' && (
                          <td className="py-3 px-4 text-right font-mono-tabular whitespace-nowrap text-zinc-200">
                            {formatPkr(row.monthlyBasePkr + row.walletBonusPkr)}
                          </td>
                        )}
                        <td className="py-3 px-4 text-right font-mono-tabular whitespace-nowrap">
                          <p className="font-bold text-amber-300">{formatPkr(row.codCashPkr)}</p>
                          {row.onlineCount > 0 && (
                            <p className="text-[10px] text-emerald-400">
                              {row.onlineCount} online (Rs. 0)
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular font-extrabold text-yellow-400 whitespace-nowrap">
                          {formatPkr(row.netPayableToRiderPkr)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase border ${
                              isPaid
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                                : 'bg-amber-500/15 text-yellow-300 border-amber-500/35'
                            }`}
                          >
                            {isPaid ? 'Paid' : 'Pending'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap no-print">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setIndividualReportPreview({ type: 'rider', targetId: row.rider.id })
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 hover:border-amber-400 hover:text-yellow-300 text-xs font-bold inline-flex items-center gap-1"
                              title="Inspect & Print individual rider report"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Report
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onSaveSalaryRecord({
                                  id: row.payoutId,
                                  targetType: 'rider',
                                  targetId: row.rider.id,
                                  targetName: row.rider.name,
                                  roleLabel:
                                    riderReportMode === 'daily'
                                      ? `Rider Daily Payout (${riderPeriodKey})`
                                      : riderReportMode === 'range'
                                        ? `Rider Custom Range (${riderPeriodKey})`
                                        : `Rider Monthly Payout (${riderPeriodKey})`,
                                  monthKey: riderPeriodKey,
                                  baseSalaryPkr: row.deliveryPayPkr + row.monthlyBasePkr,
                                  bonusPkr: row.tipsPkr + row.walletBonusPkr,
                                  deductionPkr: 0,
                                  netAmountPkr: row.netPayableToRiderPkr,
                                  status: isPaid ? 'pending' : 'paid',
                                  ...(isPaid ? {} : { paidAt: new Date().toISOString() }),
                                  createdAt: new Date().toISOString(),
                                })
                              }
                              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                                isPaid
                                  ? 'bg-zinc-900 border border-amber-500/40 text-amber-300 hover:bg-amber-500/15'
                                  : 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 hover:brightness-105'
                              }`}
                            >
                              {isPaid ? 'Mark Pending' : 'Pay Rider'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-amber-500/35 bg-amber-500/10 text-xs font-extrabold">
                    <td className="py-3.5 px-4 text-yellow-300 uppercase tracking-wider">
                      Fleet {riderReportMode === 'daily' ? 'Daily' : riderReportMode === 'range' ? 'Custom Range' : 'Monthly'} Total ({riderReportData.rows.length}{' '}
                      {riderReportData.rows.length === 1 ? 'rider' : 'riders'})
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-tabular text-white whitespace-nowrap">
                      {riderReportData.totalTrips} trips
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-tabular text-yellow-300 whitespace-nowrap">
                      {riderReportData.totalDistanceKm.toFixed(1)} km
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-tabular text-emerald-400 whitespace-nowrap">
                      {formatPkr(riderReportData.totalTripPayAndTips)}
                    </td>
                    {riderReportMode === 'monthly' && (
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-zinc-200 whitespace-nowrap">
                        {formatPkr(
                          riderReportData.rows.reduce(
                            (s, r) => s + r.monthlyBasePkr + r.walletBonusPkr,
                            0
                          )
                        )}
                      </td>
                    )}
                    <td className="py-3.5 px-4 text-right font-mono-tabular text-amber-300 whitespace-nowrap">
                      {formatPkr(riderReportData.totalCodCash)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-tabular text-yellow-400 whitespace-nowrap">
                      {formatPkr(riderReportData.totalPayableToRiders)}
                    </td>
                    <td colSpan={2} className="py-3.5 px-4 text-right text-[11px] text-emerald-400 font-mono-tabular">
                      Paid: {formatPkr(riderReportData.totalPaidToRiders)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Itemized Rider Trips Breakdown for Selected Period */}
            <div className="border-t border-zinc-800 p-4 bg-zinc-950/60">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                  Itemized Delivered Orders &amp; Per-Order Distance ({riderReportData.filteredTrips.length} delivered in {riderPeriodLabel})
                </h3>
                <span className="text-xs font-mono-tabular font-extrabold text-yellow-300">
                  Total Distance: {riderReportData.filteredTripsTotalDistanceKm.toFixed(1)} km
                </span>
              </div>
              {riderReportData.filteredTrips.length === 0 ? (
                <p className="text-xs text-zinc-500 py-4 text-center">
                  No completed rider deliveries recorded for {riderPeriodLabel}.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-500">
                        <th className="py-2 px-3">Order</th>
                        <th className="py-2 px-3">Rider</th>
                        <th className="py-2 px-3">Business &amp; Drop-off</th>
                        <th className="py-2 px-3">Method</th>
                        <th className="py-2 px-3 text-right">Distance (km)</th>
                        <th className="py-2 px-3 text-right">Delivery Pay</th>
                        <th className="py-2 px-3 text-right">Tip</th>
                        <th className="py-2 px-3 text-right">Rider Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {riderReportData.filteredTrips.slice(0, 100).map((t) => {
                        const rObj = riders.find((r) => r.id === t.riderId);
                        return (
                          <tr key={t.id} className="hover:bg-zinc-900/40">
                            <td className="py-2 px-3 font-mono-tabular font-bold text-yellow-400 whitespace-nowrap">
                              {t.orderCode}
                            </td>
                            <td className="py-2 px-3 font-bold text-white whitespace-nowrap">
                              {rObj?.name || t.riderId}
                            </td>
                            <td className="py-2 px-3 text-zinc-300">
                              <span className="font-semibold text-white">{t.restaurantName}</span> ·{' '}
                              <span className="text-zinc-400">{t.dropoffArea}</span>
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              {t.paymentMethod === 'COD' && !t.whatsappAmountAlreadyPaid ? (
                                <span className="text-amber-300 font-bold">COD</span>
                              ) : (
                                <span className="text-emerald-400 font-bold">
                                  {t.whatsappAmountAlreadyPaid ? 'WA Already Paid' : t.paymentMethod} (Rs. 0 Cash)
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono-tabular font-extrabold text-yellow-300 whitespace-nowrap">
                              {t.distanceKm.toFixed(1)} km
                            </td>
                            <td className="py-2 px-3 text-right font-mono-tabular text-white whitespace-nowrap">
                              {formatPkr(t.deliveryFeePkr)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono-tabular text-amber-300 whitespace-nowrap">
                              {t.tipPkr > 0 ? `+${formatPkr(t.tipPkr)}` : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono-tabular font-extrabold text-emerald-400 whitespace-nowrap">
                              {formatPkr(t.deliveryFeePkr + t.tipPkr)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-amber-500/35 bg-amber-500/10 text-xs font-extrabold">
                        <td colSpan={4} className="py-2.5 px-3 text-yellow-300 uppercase tracking-wider">
                          Delivered Orders Total ({riderReportData.filteredTrips.length} orders)
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-yellow-300 whitespace-nowrap">
                          {riderReportData.filteredTripsTotalDistanceKm.toFixed(1)} km
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-white whitespace-nowrap">
                          {formatPkr(riderReportData.filteredTripsTotalDeliveryPay)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-amber-300 whitespace-nowrap">
                          {formatPkr(riderReportData.filteredTripsTotalTips)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-emerald-400 whitespace-nowrap">
                          {formatPkr(
                            riderReportData.filteredTripsTotalDeliveryPay +
                              riderReportData.filteredTripsTotalTips
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* SECTION 3: SEPARATED SALARY MANAGEMENT (RIDERS SECTION & STAFF SECTION) */}
      {activeSection === 'salary' && perms.canManageSalaries && (
        <section className="space-y-6">
          {/* Combined Overview + Section Switcher & Search */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 bg-[#0E0E14] border border-amber-500/35 rounded-2xl space-y-1.5 shadow-xl">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                <span>Monthly Payroll Total ({currentMonthLabel})</span>
                <Wallet className="w-4 h-4 text-yellow-400" />
              </div>
              <p className="text-2xl font-extrabold font-mono-tabular text-yellow-400">
                {formatPkr(payrollSummary.totalNet)}
              </p>
              <p className="text-xs font-semibold text-zinc-400">
                {riderPayrollRows.length} Riders ({formatPkr(riderPayrollSummary.totalNet)}) ·{' '}
                {staffPayrollRows.length} Staff ({formatPkr(staffPayrollSummary.totalNet)})
              </p>
            </div>

            <div className="p-5 bg-[#0E0E14] border border-emerald-500/30 rounded-2xl space-y-1.5 shadow-xl">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                <span>Salaries Paid</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-extrabold font-mono-tabular text-emerald-400">
                {formatPkr(payrollSummary.totalPaid)}
              </p>
              <p className="text-xs font-semibold text-zinc-400">
                Riders {riderPayrollSummary.paidCount}/{riderPayrollRows.length} · Staff{' '}
                {staffPayrollSummary.paidCount}/{staffPayrollRows.length}
              </p>
            </div>

            <div className="p-5 bg-[#0E0E14] border border-zinc-800 rounded-2xl space-y-1.5 shadow-xl">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                <span>Pending Payroll</span>
                <Coins className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-2xl font-extrabold font-mono-tabular text-white">
                {formatPkr(payrollSummary.totalPending)}
              </p>
              <div className="pt-1 flex items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={() => handleDownloadPayrollCsv()}
                  className="text-xs font-extrabold text-yellow-400 hover:underline inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  Full Payroll CSV
                </button>
                <span className="text-zinc-700">·</span>
                <button
                  type="button"
                  onClick={() => triggerPrintWithTitle(`HSP-delivery-Payroll-${currentMonthKey}`)}
                  className="text-xs font-extrabold text-amber-300 hover:underline inline-flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Full Payroll
                </button>
              </div>
            </div>
          </div>

          {/* Salary Filter & Section View Switcher */}
          <div className="p-4 bg-[#0E0E14] border border-zinc-800 rounded-2xl flex flex-wrap items-center justify-between gap-3 no-print">
            <div className="inline-flex rounded-xl bg-zinc-950 p-1 border border-zinc-800">
              {(
                [
                  { id: 'all', label: `Both Sections (${payrollRows.length})` },
                  { id: 'riders', label: `Riders Salary (${riderPayrollRows.length})` },
                  { id: 'staff', label: `Staff Salary (${staffPayrollRows.length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSalarySectionView(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                    salarySectionView === tab.id
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-yellow-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={salarySearch}
                  onChange={(e) => setSalarySearch(e.target.value)}
                  placeholder="Search rider, staff, or ID..."
                  className="pl-8 pr-3 py-2 text-xs font-semibold rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400 w-52"
                />
              </div>
              <select
                value={salaryStatusFilter}
                onChange={(e) =>
                  setSalaryStatusFilter(e.target.value as 'ALL' | 'paid' | 'pending')
                }
                className="px-3 py-2 text-xs font-bold rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-amber-400"
              >
                <option value="ALL">All Statuses</option>
                <option value="paid">Paid Only</option>
                <option value="pending">Pending Only</option>
              </select>
            </div>
          </div>

          {/* SECTION 3A: RIDERS SALARY MANAGEMENT */}
          {(salarySectionView === 'all' || salarySectionView === 'riders') && (
            <div className="bg-[#0E0E14] border border-amber-500/35 rounded-2xl overflow-hidden shadow-xl print-card">
              <div className="p-5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 text-yellow-400 flex items-center justify-center shrink-0">
                    <Bike className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-white">
                      Riders Salary Management ({currentMonthLabel})
                    </h2>
                    <p className="text-xs font-semibold text-zinc-400">
                      Total: <span className="font-mono-tabular text-yellow-400">{formatPkr(riderPayrollSummary.totalNet)}</span> · Paid:{' '}
                      <span className="font-mono-tabular text-emerald-400">{formatPkr(riderPayrollSummary.totalPaid)}</span> · Pending:{' '}
                      <span className="font-mono-tabular text-white">{formatPkr(riderPayrollSummary.totalPending)}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 no-print">
                  <button
                    type="button"
                    onClick={() => handleDownloadPayrollCsv('rider')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-amber-400 hover:text-yellow-300"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Riders Salary CSV
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-zinc-900/70 border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
                      <th className="py-3.5 px-4 font-extrabold">Rider &amp; ID</th>
                      <th className="py-3.5 px-4 font-extrabold">Base Salary (PKR)</th>
                      <th className="py-3.5 px-4 font-extrabold">Bonus (PKR)</th>
                      <th className="py-3.5 px-4 font-extrabold">Deduction (PKR)</th>
                      <th className="py-3.5 px-4 font-extrabold text-right">Net Payable</th>
                      <th className="py-3.5 px-4 font-extrabold">Status</th>
                      <th className="py-3.5 px-4 font-extrabold text-right no-print">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80">
                    {filteredRiderPayrollRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-xs text-zinc-500">
                          No rider salary records match your filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRiderPayrollRows.map((row) => {
                        const draft = salaryEdits[row.id] || {};
                        const base = draft.base ?? row.baseSalaryPkr;
                        const bonus = draft.bonus ?? row.bonusPkr;
                        const deduction = draft.deduction ?? row.deductionPkr;
                        const net = Math.max(0, base + bonus - deduction);
                        const isPaid = row.status === 'paid';

                        const buildRecord = (nextStatus: 'paid' | 'pending'): SalaryPayment => ({
                          ...row,
                          baseSalaryPkr: base,
                          bonusPkr: bonus,
                          deductionPkr: deduction,
                          netAmountPkr: net,
                          status: nextStatus,
                          ...(nextStatus === 'paid' ? { paidAt: new Date().toISOString() } : {}),
                        });

                        return (
                          <tr key={row.id} className="hover:bg-zinc-900/40 transition-colors">
                            <td className="py-3.5 px-4">
                              <p className="font-extrabold text-white">{row.targetName}</p>
                              <p className="text-[11px] font-semibold text-amber-300">{row.roleLabel}</p>
                            </td>
                            <td className="py-3.5 px-4">
                              <input
                                type="number"
                                min={0}
                                value={base}
                                onChange={(e) =>
                                  setSalaryEdits((prev) => ({
                                    ...prev,
                                    [row.id]: { ...prev[row.id], base: Math.max(0, Number(e.target.value) || 0) },
                                  }))
                                }
                                className="w-28 px-2.5 py-1.5 text-xs font-mono-tabular font-bold rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-amber-400"
                              />
                            </td>
                            <td className="py-3.5 px-4">
                              <input
                                type="number"
                                min={0}
                                value={bonus}
                                onChange={(e) =>
                                  setSalaryEdits((prev) => ({
                                    ...prev,
                                    [row.id]: { ...prev[row.id], bonus: Math.max(0, Number(e.target.value) || 0) },
                                  }))
                                }
                                className="w-24 px-2.5 py-1.5 text-xs font-mono-tabular font-bold rounded-lg bg-zinc-950 border border-zinc-700 text-emerald-400 focus:outline-none focus:border-amber-400"
                              />
                            </td>
                            <td className="py-3.5 px-4">
                              <input
                                type="number"
                                min={0}
                                value={deduction}
                                onChange={(e) =>
                                  setSalaryEdits((prev) => ({
                                    ...prev,
                                    [row.id]: { ...prev[row.id], deduction: Math.max(0, Number(e.target.value) || 0) },
                                  }))
                                }
                                className="w-24 px-2.5 py-1.5 text-xs font-mono-tabular font-bold rounded-lg bg-zinc-950 border border-zinc-700 text-rose-300 focus:outline-none focus:border-amber-400"
                              />
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono-tabular font-extrabold text-yellow-400 whitespace-nowrap">
                              {formatPkr(net)}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase border ${
                                  isPaid
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                                    : 'bg-amber-500/15 text-yellow-300 border-amber-500/35'
                                }`}
                              >
                                {isPaid ? 'Paid' : 'Pending'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap no-print">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setIndividualReportPreview({ type: 'rider', targetId: row.targetId })
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 hover:border-amber-400 hover:text-yellow-300 text-xs font-bold inline-flex items-center gap-1"
                                  title="View & print individual rider report"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  Report
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onSaveSalaryRecord(buildRecord(row.status))}
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold hover:border-amber-400"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onSaveSalaryRecord(buildRecord(isPaid ? 'pending' : 'paid'))
                                  }
                                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                                    isPaid
                                      ? 'bg-zinc-900 border border-amber-500/40 text-amber-300 hover:bg-amber-500/15'
                                      : 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 hover:brightness-105'
                                  }`}
                                >
                                  {isPaid ? 'Mark Pending' : 'Pay Salary'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SECTION 3B: STAFF & MANAGERS SALARY MANAGEMENT */}
          {(salarySectionView === 'all' || salarySectionView === 'staff') && (
            <div className="bg-[#0E0E14] border border-emerald-500/30 rounded-2xl overflow-hidden shadow-xl print-card">
              <div className="p-5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-white">
                      Staff &amp; Managers Salary Management ({currentMonthLabel})
                    </h2>
                    <p className="text-xs font-semibold text-zinc-400">
                      Total: <span className="font-mono-tabular text-yellow-400">{formatPkr(staffPayrollSummary.totalNet)}</span> · Paid:{' '}
                      <span className="font-mono-tabular text-emerald-400">{formatPkr(staffPayrollSummary.totalPaid)}</span> · Pending:{' '}
                      <span className="font-mono-tabular text-white">{formatPkr(staffPayrollSummary.totalPending)}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 no-print">
                  <button
                    type="button"
                    onClick={() => handleDownloadPayrollCsv('staff')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-emerald-400 hover:text-emerald-300"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Staff Salary CSV
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-zinc-900/70 border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
                      <th className="py-3.5 px-4 font-extrabold">Staff Employee &amp; Role</th>
                      <th className="py-3.5 px-4 font-extrabold">Base Salary (PKR)</th>
                      <th className="py-3.5 px-4 font-extrabold">Bonus (PKR)</th>
                      <th className="py-3.5 px-4 font-extrabold">Deduction (PKR)</th>
                      <th className="py-3.5 px-4 font-extrabold text-right">Net Payable</th>
                      <th className="py-3.5 px-4 font-extrabold">Status</th>
                      <th className="py-3.5 px-4 font-extrabold text-right no-print">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80">
                    {filteredStaffPayrollRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-xs text-zinc-500">
                          No staff salary records match your filter.
                        </td>
                      </tr>
                    ) : (
                      filteredStaffPayrollRows.map((row) => {
                        const draft = salaryEdits[row.id] || {};
                        const base = draft.base ?? row.baseSalaryPkr;
                        const bonus = draft.bonus ?? row.bonusPkr;
                        const deduction = draft.deduction ?? row.deductionPkr;
                        const net = Math.max(0, base + bonus - deduction);
                        const isPaid = row.status === 'paid';

                        const buildRecord = (nextStatus: 'paid' | 'pending'): SalaryPayment => ({
                          ...row,
                          baseSalaryPkr: base,
                          bonusPkr: bonus,
                          deductionPkr: deduction,
                          netAmountPkr: net,
                          status: nextStatus,
                          ...(nextStatus === 'paid' ? { paidAt: new Date().toISOString() } : {}),
                        });

                        return (
                          <tr key={row.id} className="hover:bg-zinc-900/40 transition-colors">
                            <td className="py-3.5 px-4">
                              <p className="font-extrabold text-white">{row.targetName}</p>
                              <p className="text-[11px] font-semibold text-emerald-300">{row.roleLabel}</p>
                            </td>
                            <td className="py-3.5 px-4">
                              <input
                                type="number"
                                min={0}
                                value={base}
                                onChange={(e) =>
                                  setSalaryEdits((prev) => ({
                                    ...prev,
                                    [row.id]: { ...prev[row.id], base: Math.max(0, Number(e.target.value) || 0) },
                                  }))
                                }
                                className="w-28 px-2.5 py-1.5 text-xs font-mono-tabular font-bold rounded-lg bg-zinc-950 border border-zinc-700 text-white focus:outline-none focus:border-amber-400"
                              />
                            </td>
                            <td className="py-3.5 px-4">
                              <input
                                type="number"
                                min={0}
                                value={bonus}
                                onChange={(e) =>
                                  setSalaryEdits((prev) => ({
                                    ...prev,
                                    [row.id]: { ...prev[row.id], bonus: Math.max(0, Number(e.target.value) || 0) },
                                  }))
                                }
                                className="w-24 px-2.5 py-1.5 text-xs font-mono-tabular font-bold rounded-lg bg-zinc-950 border border-zinc-700 text-emerald-400 focus:outline-none focus:border-amber-400"
                              />
                            </td>
                            <td className="py-3.5 px-4">
                              <input
                                type="number"
                                min={0}
                                value={deduction}
                                onChange={(e) =>
                                  setSalaryEdits((prev) => ({
                                    ...prev,
                                    [row.id]: { ...prev[row.id], deduction: Math.max(0, Number(e.target.value) || 0) },
                                  }))
                                }
                                className="w-24 px-2.5 py-1.5 text-xs font-mono-tabular font-bold rounded-lg bg-zinc-950 border border-zinc-700 text-rose-300 focus:outline-none focus:border-amber-400"
                              />
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono-tabular font-extrabold text-yellow-400 whitespace-nowrap">
                              {formatPkr(net)}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase border ${
                                  isPaid
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                                    : 'bg-amber-500/15 text-yellow-300 border-amber-500/35'
                                }`}
                              >
                                {isPaid ? 'Paid' : 'Pending'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap no-print">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setIndividualReportPreview({ type: 'staff', targetId: row.targetId })
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 hover:border-emerald-400 hover:text-emerald-300 text-xs font-bold inline-flex items-center gap-1"
                                  title="View & print individual employee report"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  Report
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onSaveSalaryRecord(buildRecord(row.status))}
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold hover:border-amber-400"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onSaveSalaryRecord(buildRecord(isPaid ? 'pending' : 'paid'))
                                  }
                                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                                    isPaid
                                      ? 'bg-zinc-900 border border-amber-500/40 text-amber-300 hover:bg-amber-500/15'
                                      : 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 hover:brightness-105'
                                  }`}
                                >
                                  {isPaid ? 'Mark Pending' : 'Pay Salary'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* SECTION 4: MANAGERS & STAFF ACCESS CONTROL (APP OWNER ONLY) */}
      {activeSection === 'staff' && isOwner && (
        <section className="space-y-6">
          <form
            onSubmit={handleCreateStaff}
            className="p-6 bg-[#0E0E14] border border-amber-500/35 rounded-2xl space-y-5 shadow-xl no-print"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-400 text-zinc-950 flex items-center justify-center shrink-0">
                <UserCog className="w-5 h-5 stroke-[2.3]" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Add Manager or Staff &amp; Configure Permissions
                </h2>
                <p className="text-xs font-semibold text-zinc-400">
                  Only the authorized App Owner can issue or edit Staff/Manager Emails, Login IDs &amp; permissions.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="e.g., Usman Tariq"
                  className="w-full px-3.5 py-2.5 text-sm font-semibold bg-zinc-950 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">Approved Email</label>
                <input
                  type="email"
                  required
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  placeholder="staff@gmail.com"
                  className="w-full px-3.5 py-2.5 text-sm font-semibold bg-zinc-950 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">Role</label>
                <select
                  value={staffRole}
                  onChange={(e) => {
                    const next = e.target.value as 'manager' | 'staff';
                    setStaffRole(next);
                    setStaffLoginId(
                      next === 'manager'
                        ? `MGR-${103 + staffMembers.length}`
                        : `STF-${103 + staffMembers.length}`
                    );
                  }}
                  className="w-full px-3.5 py-2.5 text-sm font-bold bg-zinc-950 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                >
                  <option value="manager">Manager</option>
                  <option value="staff">Team Staff</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">Login ID</label>
                <input
                  type="text"
                  required
                  value={staffLoginId}
                  onChange={(e) => setStaffLoginId(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular font-extrabold uppercase bg-zinc-950 text-yellow-300 rounded-xl border border-amber-500/40 focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">City</label>
                <select
                  value={staffCity}
                  onChange={(e) => setStaffCity(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-bold bg-zinc-950 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                >
                  {PAKISTAN_CITIES.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">Monthly Salary (PKR)</label>
                <input
                  type="number"
                  required
                  min={5000}
                  value={staffSalary}
                  onChange={(e) => setStaffSalary(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-950 text-emerald-400 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {PERMISSION_LABELS.map(({ key, label }) => {
                const checked = staffPerms[key];
                return (
                  <label
                    key={key}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors text-xs font-bold ${
                      checked
                        ? 'bg-amber-500/15 border-amber-400/50 text-yellow-200'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setStaffPerms((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                      className="accent-yellow-400 w-4 h-4"
                    />
                    {label}
                  </label>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <input
                type="tel"
                value={staffPhone}
                onChange={(e) => setStaffPhone(e.target.value)}
                placeholder="Mobile Phone (+92 300 ...)"
                className="sm:w-64 px-3.5 py-2.5 text-sm font-mono-tabular font-semibold bg-zinc-950 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                disabled={savingStaff}
                className="px-6 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-sm font-extrabold hover:brightness-105 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <Users className="w-4 h-4" />
                {savingStaff ? 'Creating ID...' : 'Add Manager / Staff & Issue Login ID'}
              </button>
            </div>
          </form>

          {/* Existing Staff & Managers List with Search & Full Edit */}
          <div className="relative no-print">
            <Search className="w-4 h-4 text-yellow-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={staffSearch}
              onChange={(e) => setStaffSearch(e.target.value)}
              placeholder="Search managers & staff by name, email, phone, city, or Login ID..."
              className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-[#0E0E14] border border-zinc-800 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="space-y-3">
            {filteredStaffMembers.map((member) => {
              const isEditingThisStaff = editingStaffId === member.id;
              return (
                <div
                  key={member.id}
                  className="p-5 bg-[#0E0E14] border border-zinc-800 rounded-2xl space-y-4 shadow-xl"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-extrabold text-white">{member.name}</h3>
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-[11px] font-extrabold uppercase text-yellow-300 font-mono-tabular">
                          ID: {member.loginId}
                        </span>
                        <span className="text-xs font-bold uppercase text-amber-400">
                          {member.role} · {member.city}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Salary: {formatPkr(member.monthlySalaryPkr)} · Phone: {member.phone}
                        {member.email ? ` · Email: ${member.email}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 no-print">
                      <button
                        type="button"
                        onClick={() => {
                          if (isEditingThisStaff) {
                            setEditingStaffId(null);
                          } else {
                            setEditingStaffId(member.id);
                            setStaffDraft({
                              name: member.name,
                              role: member.role,
                              email: member.email || '',
                              phone: member.phone,
                              city: member.city,
                              loginId: member.loginId,
                              monthlySalaryPkr: member.monthlySalaryPkr,
                            });
                          }
                        }}
                        className="p-2 rounded-xl bg-zinc-900 border border-zinc-700 text-amber-300 hover:border-yellow-400 transition-colors"
                        title="Edit staff details"
                      >
                        {isEditingThisStaff ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setIndividualReportPreview({ type: 'staff', targetId: member.id })
                        }
                        className="px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 hover:border-amber-400 hover:text-yellow-300 text-xs font-bold inline-flex items-center gap-1 transition-colors"
                        title="Check & Print individual employee report"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Report
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleStaffActive(member.id, !member.active)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-colors ${
                          member.active
                            ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                            : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                        }`}
                      >
                        {member.active ? 'Active Access' : 'Suspended'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteStaffMember(member.id)}
                        className="p-2 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        aria-label={`Delete ${member.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isEditingThisStaff && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await onUpdateStaffDetails(member.id, staffDraft);
                        setEditingStaffId(null);
                      }}
                      className="p-4 rounded-xl bg-zinc-900/90 border border-amber-500/35 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 no-print"
                    >
                      <input
                        type="text"
                        required
                        value={staffDraft.name || ''}
                        onChange={(e) => setStaffDraft((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Full Name"
                        className="px-3 py-2 text-xs font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                      />
                      <input
                        type="email"
                        value={staffDraft.email || ''}
                        onChange={(e) =>
                          setStaffDraft((p) => ({ ...p, email: e.target.value.toLowerCase() }))
                        }
                        placeholder="Approved Email"
                        className="px-3 py-2 text-xs font-semibold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                      />
                      <input
                        type="text"
                        required
                        value={staffDraft.loginId || ''}
                        onChange={(e) =>
                          setStaffDraft((p) => ({ ...p, loginId: e.target.value.toUpperCase() }))
                        }
                        placeholder="Login ID"
                        className="px-3 py-2 text-xs font-mono-tabular font-extrabold uppercase bg-zinc-950 text-yellow-300 rounded-lg border border-amber-500/40"
                      />
                      <input
                        type="tel"
                        value={staffDraft.phone || ''}
                        onChange={(e) => setStaffDraft((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="Phone"
                        className="px-3 py-2 text-xs font-mono-tabular font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                      />
                      <select
                        value={staffDraft.role || 'manager'}
                        onChange={(e) =>
                          setStaffDraft((p) => ({
                            ...p,
                            role: e.target.value as 'manager' | 'staff',
                          }))
                        }
                        className="px-3 py-2 text-xs font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                      >
                        <option value="manager">Manager</option>
                        <option value="staff">Team Staff</option>
                      </select>
                      <select
                        value={staffDraft.city || 'Hasilpur'}
                        onChange={(e) => setStaffDraft((p) => ({ ...p, city: e.target.value }))}
                        className="px-3 py-2 text-xs font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                      >
                        {PAKISTAN_CITIES.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        value={staffDraft.monthlySalaryPkr ?? 0}
                        onChange={(e) =>
                          setStaffDraft((p) => ({
                            ...p,
                            monthlySalaryPkr: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        placeholder="Monthly Salary"
                        className="px-3 py-2 text-xs font-mono-tabular font-bold bg-zinc-950 text-emerald-400 rounded-lg border border-zinc-700"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold inline-flex items-center justify-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save Staff Details
                      </button>
                    </form>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {PERMISSION_LABELS.map(({ key, label }) => {
                      const enabled = member.permissions[key];
                      return (
                        <label
                          key={key}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                            enabled
                              ? 'bg-amber-500/10 border-amber-500/35 text-amber-200'
                              : 'bg-zinc-900/70 border-zinc-800 text-zinc-500'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) =>
                              onUpdateStaffPermissions(member.id, {
                                ...member.permissions,
                                [key]: e.target.checked,
                              })
                            }
                            className="accent-yellow-400 w-3.5 h-3.5"
                          />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* SECTION 4B: PRODUCTS (PRICE & PHOTO EDITOR) & WHATSAPP SUPPORT SETTINGS */}
      {activeSection === 'catalog' && (isOwner || perms.canManageOrders) && (
        <section className="space-y-6">
          {/* Admin WhatsApp & Welcome Banner Settings */}
          <form
            onSubmit={handleSaveSettings}
            className="p-6 bg-[#0E0E14] border border-emerald-500/35 rounded-2xl space-y-4 shadow-xl no-print"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Customer WhatsApp Order Support &amp; Welcome Banner
                </h2>
                <p className="text-xs font-semibold text-zinc-400">
                  Only Customers see the WhatsApp button on the selected-city advertising banner, routed directly to this official number.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                  Official WhatsApp Number
                </label>
                <input
                  type="tel"
                  required
                  value={whatsappInput}
                  onChange={(e) => setWhatsappInput(e.target.value)}
                  placeholder="+92 300 7741209"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-950 text-emerald-300 rounded-xl border border-emerald-500/40 focus:outline-none focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                  Welcome Banner Title
                </label>
                <input
                  type="text"
                  required
                  value={welcomeTitleInput}
                  onChange={(e) => setWelcomeTitleInput(e.target.value)}
                  placeholder="Welcome to HSP delivery"
                  className="w-full px-3.5 py-2.5 text-sm font-semibold bg-zinc-950 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                  Welcome Banner Subtitle
                </label>
                <input
                  type="text"
                  value={welcomeSubtitleInput}
                  onChange={(e) => setWelcomeSubtitleInput(e.target.value)}
                  placeholder="Express delivery for food, grocery & stores..."
                  className="w-full px-3.5 py-2.5 text-sm font-semibold bg-zinc-950 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingSettings}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 disabled:opacity-50 inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {savingSettings ? 'Saving Settings...' : 'Save WhatsApp & Welcome Settings'}
              </button>
            </div>
          </form>

          {/* Product Price & Picture Editor */}
          <div className="bg-[#0E0E14] border border-amber-500/30 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Edit Store Product Prices &amp; Pictures
                </h2>
                <p className="text-xs font-semibold text-zinc-400">
                  Admin &amp; Managers can update any product price (PKR), picture (WebP), category, or stock availability.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-yellow-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search product or category..."
                    className="pl-8 pr-3 py-2 text-xs font-semibold rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400 w-48"
                  />
                </div>
                <select
                  value={catalogStoreId}
                  onChange={(e) => {
                    setCatalogStoreId(e.target.value);
                    setEditingProductId(null);
                  }}
                  className="px-3.5 py-2 text-xs font-bold rounded-xl bg-zinc-900 border border-amber-500/35 text-yellow-300 focus:outline-none focus:border-amber-400"
                >
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.city})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="divide-y divide-zinc-800">
              {menuItems
                .filter((m) => {
                  if (m.restaurantId !== catalogStoreId) return false;
                  const q = productSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    m.name.toLowerCase().includes(q) ||
                    m.category.toLowerCase().includes(q) ||
                    m.description.toLowerCase().includes(q)
                  );
                })
                .map((item) => {
                  const isEditingProd = editingProductId === item.id;
                  return (
                    <div key={item.id} className="p-4 space-y-3">
                      <div className="flex items-center gap-3.5">
                        <div className="w-16 h-12 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0">
                          <FoodImage src={item.imageUrl} alt={item.name} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-extrabold text-white truncate">{item.name}</p>
                          <p className="text-xs text-zinc-400 truncate">
                            {item.category} · {item.available ? 'In Stock' : 'Out of Stock'}
                          </p>
                          {item.varieties && item.varieties.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.varieties.map((v) => (
                                <span
                                  key={v.id}
                                  className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] font-bold text-yellow-300 font-mono-tabular"
                                >
                                  {v.label}: {formatPkr(v.pricePkr)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="font-mono-tabular text-sm font-extrabold text-yellow-400 shrink-0">
                          {formatPkr(item.pricePkr)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditingProd) {
                              setEditingProductId(null);
                            } else {
                              setEditingProductId(item.id);
                              setProdDraftName(item.name);
                              setProdDraftPrice(String(item.pricePkr));
                              setProdDraftVarieties(
                                [0, 1, 2, 3].map((idx) => ({
                                  label: item.varieties?.[idx]?.label || '',
                                  pricePkr: item.varieties?.[idx]?.pricePkr
                                    ? String(item.varieties[idx].pricePkr)
                                    : '',
                                }))
                              );
                              setProdDraftCategory(item.category);
                              setProdDraftDesc(item.description);
                              setProdDraftImage(item.imageUrl);
                              setProdDraftAvailable(item.available);
                            }
                          }}
                          className="p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-amber-300 hover:border-yellow-400 no-print"
                          title="Edit product price, varieties & image"
                        >
                          {isEditingProd ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                        </button>
                      </div>

                      {isEditingProd && (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const parsedVarieties: MenuItemVariety[] = prodDraftVarieties
                              .map((v, idx) => ({
                                id: `var-${idx + 1}`,
                                label: v.label.trim().slice(0, 60),
                                pricePkr: Math.round(Number(v.pricePkr) || 0),
                              }))
                              .filter((v) => v.label.length >= 1 && v.pricePkr > 0);
                            await onUpdateMenuItem(item.id, {
                              name: prodDraftName.trim(),
                              pricePkr: Math.max(
                                10,
                                Math.round(
                                  Number(prodDraftPrice) || parsedVarieties[0]?.pricePkr || 100
                                )
                              ),
                              varieties: parsedVarieties,
                              category: prodDraftCategory.trim() || item.category,
                              description: prodDraftDesc.trim(),
                              imageUrl: prodDraftImage,
                              available: prodDraftAvailable,
                            });
                            setEditingProductId(null);
                          }}
                          className="p-4 rounded-xl bg-zinc-900/90 border border-amber-500/35 space-y-3 no-print"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <input
                              type="text"
                              required
                              value={prodDraftName}
                              onChange={(e) => setProdDraftName(e.target.value)}
                              placeholder="Product Name"
                              className="sm:col-span-2 px-3 py-2 text-xs font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                            />
                            <input
                              type="number"
                              required
                              min={10}
                              max={100000}
                              value={prodDraftPrice}
                              onChange={(e) => setProdDraftPrice(e.target.value)}
                              placeholder="Base Price PKR"
                              className="px-3 py-2 text-xs font-mono-tabular font-extrabold bg-zinc-950 text-yellow-300 rounded-lg border border-amber-500/40"
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <input
                              type="text"
                              value={prodDraftCategory}
                              onChange={(e) => setProdDraftCategory(e.target.value)}
                              placeholder="Category"
                              className="px-3 py-2 text-xs font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                            />
                            <input
                              type="text"
                              value={prodDraftDesc}
                              onChange={(e) => setProdDraftDesc(e.target.value)}
                              placeholder="Description"
                              className="sm:col-span-2 px-3 py-2 text-xs font-semibold bg-zinc-950 text-white rounded-lg border border-zinc-700"
                            />
                          </div>
                          <div className="p-3 rounded-lg bg-zinc-950/90 border border-zinc-800 space-y-2">
                            <p className="text-[11px] font-extrabold text-yellow-300">
                              4 Manual Variety Options &amp; Prices (Optional)
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {prodDraftVarieties.map((slot, idx) => (
                                <div key={idx} className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono-tabular text-amber-400 w-5">
                                    #{idx + 1}
                                  </span>
                                  <input
                                    type="text"
                                    value={slot.label}
                                    onChange={(e) =>
                                      setProdDraftVarieties((prev) =>
                                        prev.map((v, i) =>
                                          i === idx ? { ...v, label: e.target.value } : v
                                        )
                                      )
                                    }
                                    placeholder={`Variety ${idx + 1}`}
                                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-semibold bg-zinc-900 text-white rounded-lg border border-zinc-700"
                                  />
                                  <input
                                    type="number"
                                    min={10}
                                    max={100000}
                                    value={slot.pricePkr}
                                    onChange={(e) =>
                                      setProdDraftVarieties((prev) =>
                                        prev.map((v, i) =>
                                          i === idx ? { ...v, pricePkr: e.target.value } : v
                                        )
                                      )
                                    }
                                    placeholder="Rs."
                                    className="w-20 px-2 py-1.5 text-xs font-mono-tabular font-bold bg-zinc-900 text-yellow-300 rounded-lg border border-amber-500/35"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="w-16 h-12 rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 shrink-0">
                              <FoodImage src={prodDraftImage} alt={prodDraftName} />
                            </div>
                            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/35 text-xs font-bold text-yellow-300 cursor-pointer">
                              <ImagePlus className="w-3.5 h-3.5" />
                              {uploadingProdImg ? 'WebP...' : 'Upload Photo'}
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  setUploadingProdImg(true);
                                  try {
                                    setProdDraftImage(await compressFoodImage(f, 640));
                                  } finally {
                                    setUploadingProdImg(false);
                                  }
                                }}
                                className="hidden"
                              />
                            </label>
                            <div className="flex flex-wrap gap-1 flex-1">
                              {CATALOG_PRESETS.map((p) => (
                                <button
                                  key={p.label}
                                  type="button"
                                  onClick={() => setProdDraftImage(p.url)}
                                  className={`px-2 py-1 rounded text-[10px] font-bold border ${
                                    prodDraftImage === p.url
                                      ? 'bg-yellow-400 text-zinc-950 border-yellow-300'
                                      : 'bg-zinc-950 text-zinc-300 border-zinc-700'
                                  }`}
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>
                            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={prodDraftAvailable}
                                onChange={(e) => setProdDraftAvailable(e.target.checked)}
                                className="accent-yellow-400 w-4 h-4"
                              />
                              In Stock
                            </label>
                            <button
                              type="submit"
                              className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold inline-flex items-center gap-1.5"
                            >
                              <Save className="w-3.5 h-3.5" />
                              Save Product
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </section>
      )}

      {/* SECTION 5: OVERVIEW (KPIs, WHATSAPP ORDER CONFIRMATION, CHARTS & DELIVERY LOGS) */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          {/* Step 3: Admin WhatsApp Custom Orders — Pending Confirmation & Link Review */}
          {perms.canManageOrders && pendingWhatsAppOrders.length > 0 && (
            <section className="bg-[#0E0E14] border border-emerald-500/45 rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xl no-print">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 text-zinc-950 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/25">
                    <MessageCircle className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-400">
                      WhatsApp Custom Orders · Admin Confirmation Queue
                    </p>
                    <h2 className="text-base sm:text-lg font-extrabold text-white">
                      Confirm WhatsApp Orders &amp; Notify All Available Riders ({pendingWhatsAppOrders.length})
                    </h2>
                  </div>
                </div>
                {highlightedWaOrderId && onClearHighlightedWaOrder && (
                  <button
                    type="button"
                    onClick={onClearHighlightedWaOrder}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-300 hover:text-white"
                  >
                    Clear Link Focus
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {pendingWhatsAppOrders.map((ord) => {
                  const isHighlighted = highlightedWaOrderId === ord.id;
                  const priceDraft = waPriceDrafts[ord.id] ?? (ord.subtotalPkr > 0 ? String(ord.subtotalPkr) : '');
                  const isRejectOpen = waRejectingId === ord.id;
                  const mapsUrl = `https://www.google.com/maps?q=${ord.deliveryLat},${ord.deliveryLng}`;

                  return (
                    <div
                      key={ord.id}
                      className={`p-4 sm:p-5 rounded-2xl bg-zinc-950 border space-y-3.5 ${
                        isHighlighted
                          ? 'border-yellow-400 ring-2 ring-yellow-400/25'
                          : 'border-emerald-500/35'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono-tabular font-extrabold text-yellow-400">
                              {ord.orderCode}
                            </span>
                            <span className="text-zinc-600">·</span>
                            <span className="font-bold text-emerald-400">WhatsApp Order</span>
                            <span className="text-zinc-600">·</span>
                            <span className="font-bold text-amber-300 capitalize">
                              {ord.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-sm font-extrabold text-white">
                            {ord.customerName}
                          </p>
                          <p className="text-xs font-mono-tabular font-bold text-zinc-300 inline-flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-yellow-400" />
                            {ord.customerPhone}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-[11px] font-bold text-zinc-400">Delivery Charges</p>
                          <p className="text-base font-mono-tabular font-extrabold text-yellow-400">
                            {formatPkr(ord.deliveryFeePkr)}
                          </p>
                          <p className="text-[11px] font-mono-tabular text-zinc-400">
                            {(ord.distanceKm ?? 3).toFixed(1)} km · Rider pay {formatPkr(ord.riderEarningPkr ?? calculateRiderDeliveryEarningPkr(ord.distanceKm ?? 3, liveDeliveryRates))}
                          </p>
                        </div>
                      </div>

                      {/* Attached Item Photo + Customer Note */}
                      <div className="flex flex-col sm:flex-row gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                        {ord.whatsappItemPhoto && (
                          <button
                            type="button"
                            onClick={() => setWaPhotoPreview(ord.whatsappItemPhoto || null)}
                            className="shrink-0 group relative rounded-lg overflow-hidden border border-emerald-500/40 w-full sm:w-24 h-28 sm:h-24"
                            title="Click to enlarge item photo"
                          >
                            <img
                              src={ord.whatsappItemPhoto}
                              alt="Customer attached item"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-bold text-yellow-300">
                              Zoom
                            </span>
                          </button>
                        )}
                        <div className="space-y-1.5 text-xs min-w-0 flex-1">
                          <p className="font-extrabold text-zinc-300">Customer Note:</p>
                          <p className="text-white font-medium leading-relaxed">
                            {ord.whatsappItemNote || ord.deliveryNotes || 'See attached item photo'}
                          </p>
                          <div className="pt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                            <span className="inline-flex items-center gap-1 text-zinc-200 font-semibold">
                              <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              {ord.deliveryAddress}
                            </span>
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-bold text-yellow-400 hover:underline"
                            >
                              Open Pin
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Admin Action Controls */}
                      {ord.status === 'placed' ? (
                        isRejectOpen ? (
                          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 space-y-2">
                            <input
                              type="text"
                              value={waRejectReason}
                              onChange={(e) => setWaRejectReason(e.target.value)}
                              placeholder="Reason for rejecting this WhatsApp order..."
                              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-xs font-semibold text-white focus:outline-none focus:border-rose-400"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!onRejectWhatsAppOrder || waRejectReason.trim().length < 3) return;
                                  await onRejectWhatsAppOrder(ord.id, waRejectReason.trim());
                                  setWaRejectingId(null);
                                  setWaRejectReason('');
                                }}
                                disabled={waRejectReason.trim().length < 3}
                                className="px-3.5 py-2 rounded-lg bg-rose-500 text-white text-xs font-extrabold disabled:opacity-50"
                              >
                                Send Rejection
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setWaRejectingId(null);
                                  setWaRejectReason('');
                                }}
                                className="px-3 py-2 rounded-lg bg-zinc-900 text-zinc-300 text-xs font-bold"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="text-[11px] font-bold text-zinc-400 shrink-0">
                                Item Price (optional PKR):
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={priceDraft}
                                onChange={(e) =>
                                  setWaPriceDrafts((prev) => ({
                                    ...prev,
                                    [ord.id]: e.target.value,
                                  }))
                                }
                                placeholder="0"
                                className="w-28 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-mono-tabular font-bold text-white focus:outline-none focus:border-amber-400"
                              />
                              <span className="text-[11px] font-mono-tabular text-zinc-400">
                                Total: {formatPkr((Math.max(0, Number(priceDraft) || 0)) + ord.deliveryFeePkr)}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={waConfirmingId === ord.id}
                                onClick={async () => {
                                  if (!onConfirmWhatsAppOrder) return;
                                  setWaConfirmingId(ord.id);
                                  try {
                                    const parsedItemPrice = Math.max(
                                      0,
                                      Math.round(Number(priceDraft) || 0)
                                    );
                                    await onConfirmWhatsAppOrder(ord.id, parsedItemPrice);
                                  } finally {
                                    setWaConfirmingId(null);
                                  }
                                }}
                                className="flex-1 min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-md transition-colors whitespace-nowrap"
                              >
                                <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                                {waConfirmingId === ord.id
                                  ? 'Confirming...'
                                  : 'Confirm Order & Notify Riders'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePrintAdminOrderSlip(ord)}
                                className="min-h-[42px] px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 hover:border-amber-400 hover:text-yellow-300 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                Print Invoice
                              </button>
                              {onRejectWhatsAppOrder && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setWaRejectingId(ord.id);
                                    setWaRejectReason('');
                                  }}
                                  className="min-h-[42px] px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25 text-xs font-bold"
                                >
                                  Reject
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-800">
                          <span className="text-xs font-bold text-emerald-400 inline-flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" />
                            Confirmed · {ord.riderName ? `Assigned to ${ord.riderName}` : 'Notifying available riders'}
                            {ord.whatsappAmountAlreadyPaid ? ' · Amount Already Paid ✓' : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => handlePrintAdminOrderSlip(ord)}
                            className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 hover:border-amber-400 hover:text-yellow-300 text-xs font-bold inline-flex items-center gap-1.5"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Print Invoice
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {perms.canViewAnalytics && (
            <>
              {/* 4-Column KPI Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 bg-[#0E0E14] border border-amber-500/30 rounded-2xl space-y-1.5 shadow-xl">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                    <span>Gross Order Volume</span>
                    <TrendingUp className="w-4 h-4 text-yellow-400" />
                  </div>
                  <p className="text-2xl font-extrabold font-mono-tabular text-yellow-400">
                    {formatPkr(metrics.totalRevenue)}
                  </p>
                  <p className="text-xs font-semibold text-zinc-400">Settled &amp; pending PKR</p>
                </div>

                <div className="p-5 bg-[#0E0E14] border border-zinc-800 rounded-2xl space-y-1.5 shadow-xl">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                    <span>Total Deliveries</span>
                    <Package className="w-4 h-4 text-amber-400" />
                  </div>
                  <p className="text-2xl font-extrabold font-mono-tabular text-white">
                    {metrics.totalOrders}
                  </p>
                  <p className="text-xs font-semibold text-zinc-400">Logged across urban hubs</p>
                </div>

                <div className="p-5 bg-[#0E0E14] border border-zinc-800 rounded-2xl space-y-1.5 shadow-xl">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                    <span>Cash on Delivery Share</span>
                    <Banknote className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="text-2xl font-extrabold font-mono-tabular text-white">
                    {metrics.codShare}%
                  </p>
                  <p className="text-xs font-semibold text-zinc-400">Primary Pakistan payment mode</p>
                </div>

                <div className="p-5 bg-[#0E0E14] border border-zinc-800 rounded-2xl space-y-1.5 shadow-xl">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                    <span>Average Rider Rating</span>
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  </div>
                  <p className="text-2xl font-extrabold font-mono-tabular text-white">
                    {metrics.avgRating.toFixed(1)} / 5.0
                  </p>
                  <p className="text-xs font-semibold text-zinc-400">Customer-verified scores</p>
                </div>
              </div>

              {/* Past 7 Days Hasilpur Order Volume & Revenue Line Chart */}
              <div className="p-6 bg-[#0E0E14] border border-zinc-800 rounded-2xl space-y-4 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-yellow-400">
                      Hasilpur 7-Day Performance
                    </p>
                    <h2 className="text-base sm:text-lg font-extrabold text-white mt-0.5">
                      Daily Order Volume &amp; Total Revenue (Hasilpur)
                    </h2>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono-tabular">
                    <span className="text-zinc-400">
                      7d Orders:{' '}
                      <strong className="text-white font-extrabold">{hasilpur7DayTotals.orders}</strong>
                    </span>
                    <span aria-hidden="true" className="text-zinc-700">·</span>
                    <span className="text-zinc-400">
                      7d Revenue:{' '}
                      <strong className="text-yellow-400 font-extrabold">
                        {formatPkr(hasilpur7DayTotals.revenue)}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={hasilpur7DayData} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 12, fill: '#a1a1aa', fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="revenue"
                        orientation="left"
                        tick={{ fontSize: 11, fill: '#facc15', fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `Rs.${Math.round(Number(v) / 1000)}k`}
                      />
                      <YAxis
                        yAxisId="orders"
                        orientation="right"
                        tick={{ fontSize: 11, fill: '#e4e4e7', fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(value: unknown, name: unknown) => {
                          const label = String(name || '');
                          if (label.toLowerCase().includes('revenue')) {
                            return [formatPkr(Number(value || 0)), 'Total Revenue'];
                          }
                          return [`${Number(value || 0)} orders`, 'Daily Orders'];
                        }}
                        contentStyle={{
                          backgroundColor: '#0B0B10',
                          borderRadius: '12px',
                          border: '1px solid rgba(250, 204, 21, 0.4)',
                          color: '#fafafa',
                          fontSize: '12px',
                          fontWeight: 700,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 700, paddingTop: '8px' }} />
                      <Line
                        yAxisId="revenue"
                        type="monotone"
                        dataKey="revenue"
                        name="Total Revenue (PKR)"
                        stroke="#facc15"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#facc15', stroke: '#070709', strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: '#fde047' }}
                      />
                      <Line
                        yAxisId="orders"
                        type="monotone"
                        dataKey="orders"
                        name="Daily Order Volume"
                        stroke="#f4f4f5"
                        strokeWidth={2.5}
                        strokeDasharray="4 4"
                        dot={{ r: 3.5, fill: '#f4f4f5', stroke: '#070709', strokeWidth: 2 }}
                        activeDot={{ r: 5.5, fill: '#ffffff' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Revenue by City Chart */}
              <div className="p-6 bg-[#0E0E14] border border-zinc-800 rounded-2xl space-y-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-extrabold text-white">Revenue by City (PKR)</h2>
                  <span className="text-xs font-bold text-yellow-400">Live urban performance</span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cityChartData} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis
                        dataKey="city"
                        tick={{ fontSize: 12, fill: '#a1a1aa', fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: '#a1a1aa', fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(250, 204, 21, 0.08)' }}
                        formatter={(value: unknown) => [formatPkr(Number(value || 0)), 'Revenue']}
                        contentStyle={{
                          backgroundColor: '#0B0B10',
                          borderRadius: '12px',
                          border: '1px solid rgba(250, 204, 21, 0.4)',
                          color: '#fafafa',
                          fontSize: '12px',
                          fontWeight: 700,
                        }}
                      />
                      <Bar dataKey="revenue" fill="#facc15" radius={[8, 8, 0, 0]} maxBarSize={56} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {/* Delivery Logs Table with Rider Assignment & Inline Rider Earnings Edit */}
          {perms.canManageOrders && (
            <div className="bg-[#0E0E14] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-extrabold text-white">
                  Delivery Logs, Rider Dispatch &amp; Rider Earnings ({filteredOrders.length})
                </h2>
                <div className="flex flex-wrap items-center gap-2 no-print">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-yellow-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      placeholder="Search order, store, customer, rider, ref..."
                      className="pl-8 pr-3 py-2 text-xs font-semibold rounded-xl border border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400 w-56"
                    />
                  </div>
                  <select
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl border border-zinc-700 bg-zinc-900 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="ALL">All Cities</option>
                    {PAKISTAN_CITIES.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl border border-zinc-700 bg-zinc-900 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="placed">Placed</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="preparing">Preparing</option>
                    <option value="on_the_way">On the Way</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-zinc-900/70 border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
                      <th className="py-3.5 px-4 font-extrabold">Order ID</th>
                      <th className="py-3.5 px-4 font-extrabold">Store &amp; City</th>
                      <th className="py-3.5 px-4 font-extrabold text-right">Distance (km)</th>
                      <th className="py-3.5 px-4 font-extrabold">Assign Rider</th>
                      <th className="py-3.5 px-4 font-extrabold">Rider Pay (Editable)</th>
                      <th className="py-3.5 px-4 font-extrabold text-right">Order Bill</th>
                      <th className="py-3.5 px-4 font-extrabold">Status</th>
                      <th className="py-3.5 px-4 font-extrabold text-right no-print">Invoice</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80">
                    {filteredOrders.map((ord) => {
                      const orderDistKm = resolveOrderDistanceKm(ord);
                      const defaultRiderPay =
                        ord.riderEarningPkr ??
                        calculateRiderDeliveryEarningPkr(orderDistKm, liveDeliveryRates);
                      const isEditingPay = editingOrderId === ord.id;

                      return (
                        <tr key={ord.id} className="hover:bg-zinc-900/40 transition-colors">
                          <td className="py-3.5 px-4 font-mono-tabular font-extrabold text-yellow-400 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span>{ord.orderCode}</span>
                              {ord.orderSource === 'whatsapp' && (
                                <span className="text-[10px] font-extrabold text-emerald-400">
                                  · WA
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-semibold text-zinc-500">
                              {ord.paymentMethod}
                              {ord.whatsappAmountAlreadyPaid ? ' · Already Paid' : ''}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-extrabold text-white">{ord.restaurantName}</div>
                            <div className="text-xs font-semibold text-zinc-400">
                              {ord.city} · {ord.customerName}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono-tabular font-extrabold text-yellow-300 whitespace-nowrap">
                            {orderDistKm.toFixed(1)} km
                          </td>
                          <td className="py-3.5 px-4">
                            <select
                              value={ord.riderId || ''}
                              onChange={(e) => {
                                const chosen = riders.find((r) => r.id === e.target.value);
                                if (chosen) onAssignRiderToOrder(ord.id, chosen);
                              }}
                              className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-zinc-700 bg-zinc-900 text-white max-w-[185px] focus:outline-none focus:border-amber-400"
                            >
                              <option value="">Select Rider</option>
                              {riders.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name} ({r.city})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {isEditingPay ? (
                              <div className="flex items-center gap-1.5 no-print">
                                <input
                                  type="number"
                                  min={0}
                                  value={editingEarningVal}
                                  onChange={(e) => setEditingEarningVal(e.target.value)}
                                  className="w-20 px-2 py-1 text-xs font-mono-tabular font-bold rounded-lg bg-zinc-950 border border-yellow-400 text-yellow-300"
                                />
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await onUpdateOrderRiderEarning(
                                      ord.id,
                                      Math.max(0, Math.round(Number(editingEarningVal) || 0))
                                    );
                                    setEditingOrderId(null);
                                  }}
                                  className="p-1.5 rounded-lg bg-yellow-400 text-zinc-950"
                                  title="Save rider pay"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-2">
                                <span className="font-mono-tabular text-xs font-extrabold text-emerald-400">
                                  {formatPkr(defaultRiderPay)}
                                  {(ord.tipPkr ?? 0) > 0 ? ` + ${formatPkr(ord.tipPkr || 0)} tip` : ''}
                                </span>
                                {perms.canEditRiderEarnings && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingOrderId(ord.id);
                                      setEditingEarningVal(String(defaultRiderPay));
                                    }}
                                    className="p-1 rounded text-zinc-400 hover:text-yellow-300 no-print"
                                    title="Edit rider earning"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono-tabular font-extrabold text-yellow-400 whitespace-nowrap">
                            {formatPkr(ord.totalPkr)}
                          </td>
                          <td className="py-3.5 px-4 text-xs font-extrabold capitalize text-amber-300 whitespace-nowrap">
                            {ord.status.replace(/_/g, ' ')}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap no-print">
                            <div className="inline-flex items-center justify-end gap-2">
                              {isOwner && ord.hasDeliveryProof && (
                                <button
                                  type="button"
                                  onClick={() => openDeliveryProofModal(ord)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/45 text-xs font-extrabold text-emerald-300 hover:bg-emerald-500/25 hover:text-emerald-200 transition-colors"
                                  title={
                                    ord.deliveryProofCapturedAt
                                      ? `View Admin delivery photo proof (${new Date(
                                          ord.deliveryProofCapturedAt
                                        ).toLocaleString('en-PK')})`
                                      : 'View Admin delivery photo proof'
                                  }
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                  Photo Proof
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handlePrintAdminOrderSlip(ord)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-amber-400 hover:text-yellow-300 transition-colors"
                                title="Print Invoice"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                Print Invoice
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 6: ONLINE PAYMENTS, PAYMENT RECEIVED METHOD, BUSINESS PAYOUTS & DAILY REPORTS */}
      {activeSection === 'payments' && (
        <div className="space-y-8">
          {/* 1. Online Payments & Payment Received Method */}
          <section className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              <div className="p-4 bg-[#0E0E14] border border-emerald-500/35 rounded-2xl space-y-1 shadow-xl">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                  <span>Total Online Received</span>
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-xl font-extrabold font-mono-tabular text-emerald-400">
                  {formatPkr(onlinePaymentSummary.totalOnlinePkr)}
                </p>
                <p className="text-[11px] font-semibold text-zinc-400">
                  {onlinePaymentSummary.totalOnlineCount} online orders · Rs. 0 rider cash
                </p>
              </div>

              <div className="p-4 bg-[#0E0E14] border border-zinc-800 rounded-2xl space-y-1 shadow-xl">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                  <span>JazzCash Received</span>
                  <span className="text-[10px] font-extrabold text-yellow-400">JAZZCASH</span>
                </div>
                <p className="text-xl font-extrabold font-mono-tabular text-white">
                  {formatPkr(onlinePaymentSummary.jazzCashPkr)}
                </p>
                <p className="text-[11px] font-semibold text-zinc-400">
                  {onlinePaymentSummary.jazzCashCount} transactions
                </p>
              </div>

              <div className="p-4 bg-[#0E0E14] border border-zinc-800 rounded-2xl space-y-1 shadow-xl">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                  <span>EasyPaisa Received</span>
                  <span className="text-[10px] font-extrabold text-emerald-400">EASYPAISA</span>
                </div>
                <p className="text-xl font-extrabold font-mono-tabular text-white">
                  {formatPkr(onlinePaymentSummary.easyPaisaPkr)}
                </p>
                <p className="text-[11px] font-semibold text-zinc-400">
                  {onlinePaymentSummary.easyPaisaCount} transactions
                </p>
              </div>

              <div className="p-4 bg-[#0E0E14] border border-zinc-800 rounded-2xl space-y-1 shadow-xl">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                  <span>Card Payments</span>
                  <span className="text-[10px] font-extrabold text-amber-300">CARD</span>
                </div>
                <p className="text-xl font-extrabold font-mono-tabular text-white">
                  {formatPkr(onlinePaymentSummary.cardPkr)}
                </p>
                <p className="text-[11px] font-semibold text-zinc-400">
                  {onlinePaymentSummary.cardCount} transactions
                </p>
              </div>

              <div className="p-4 bg-[#0E0E14] border border-amber-500/30 rounded-2xl space-y-1 shadow-xl">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                  <span>COD (Rider Cash)</span>
                  <Banknote className="w-4 h-4 text-yellow-400" />
                </div>
                <p className="text-xl font-extrabold font-mono-tabular text-yellow-400">
                  {formatPkr(onlinePaymentSummary.codTotalPkr)}
                </p>
                <p className="text-[11px] font-semibold text-zinc-400">
                  {onlinePaymentSummary.codCount} COD orders only
                </p>
              </div>
            </div>

            <div className="bg-[#0E0E14] border border-emerald-500/30 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-extrabold text-white">
                    Online Payments &amp; Payment Received Method ({filteredOnlineOrders.length})
                  </h2>
                  <p className="text-xs font-semibold text-zinc-400">
                    Online-paid orders are tracked separately here and never added to rider cash collection amounts.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 no-print">
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        `hsp-online-payments-${new Date().toISOString().slice(0, 10)}.csv`,
                        [
                          'Order Code',
                          'Date',
                          'Customer',
                          'Phone',
                          'Business',
                          'Payment Method',
                          'Payment Ref',
                          'Payment Status',
                          'Rider Cash Amount (PKR)',
                          'Office Settled',
                          'Bill Amount (PKR)',
                        ],
                        filteredOnlineOrders.map((o) => [
                          o.orderCode,
                          o.createdAt,
                          o.customerName,
                          o.customerPhone,
                          o.restaurantName,
                          o.paymentMethod,
                          o.paymentRef || '',
                          o.paymentStatus,
                          0,
                          o.officeSettled ? 'Yes' : 'No',
                          o.totalPkr,
                        ])
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-amber-400 hover:text-yellow-300"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Online Payments CSV
                  </button>
                </div>
              </div>

              <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex flex-wrap items-center gap-2.5 no-print">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-yellow-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={onlinePaySearch}
                    onChange={(e) => setOnlinePaySearch(e.target.value)}
                    placeholder="Search order code, customer, store, TXN ref, rider..."
                    className="w-full pl-9 pr-3 py-2 text-xs font-semibold bg-zinc-950 text-white placeholder:text-zinc-500 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <select
                  value={onlineMethodFilter}
                  onChange={(e) =>
                    setOnlineMethodFilter(
                      e.target.value as 'ALL' | 'JAZZCASH' | 'EASYPAISA' | 'CARD'
                    )
                  }
                  className="px-3 py-2 text-xs font-bold rounded-xl bg-zinc-950 border border-zinc-700 text-yellow-300"
                >
                  <option value="ALL">All Online Methods</option>
                  <option value="JAZZCASH">JazzCash</option>
                  <option value="EASYPAISA">EasyPaisa</option>
                  <option value="CARD">Card</option>
                </select>
                <select
                  value={officeFilter}
                  onChange={(e) =>
                    setOfficeFilter(e.target.value as 'ALL' | 'settled' | 'unsettled')
                  }
                  className="px-3 py-2 text-xs font-bold rounded-xl bg-zinc-950 border border-zinc-700 text-white"
                >
                  <option value="ALL">All Office Status</option>
                  <option value="settled">Paid to Office ✓</option>
                  <option value="unsettled">Office Pending</option>
                </select>
              </div>

              {filteredOnlineOrders.length === 0 ? (
                <div className="p-8 text-center text-xs font-semibold text-zinc-400">
                  No online payment transactions match your filter.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-zinc-900/70 border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
                        <th className="py-3 px-4 font-extrabold">Order &amp; Date</th>
                        <th className="py-3 px-4 font-extrabold">Customer &amp; Business</th>
                        <th className="py-3 px-4 font-extrabold">Payment Received Method &amp; Ref</th>
                        <th className="py-3 px-4 font-extrabold">Rider Cash</th>
                        <th className="py-3 px-4 font-extrabold">Office Status</th>
                        <th className="py-3 px-4 font-extrabold text-right">Amount</th>
                        <th className="py-3 px-4 font-extrabold text-right no-print">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/80">
                      {filteredOnlineOrders.map((ord) => {
                        const isEditingPay = editingPaymentOrderId === ord.id;
                        return (
                          <tr key={ord.id} className="hover:bg-zinc-900/40">
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="font-mono-tabular font-extrabold text-yellow-400">
                                {ord.orderCode}
                              </span>
                              <div className="text-[10px] text-zinc-500">
                                {new Date(ord.createdAt).toLocaleDateString('en-PK', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-bold text-white">{ord.customerName}</div>
                              <div className="text-[11px] text-zinc-400">
                                {ord.restaurantName} ({ord.city})
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              {isEditingPay ? (
                                <div className="flex flex-wrap items-center gap-1.5 no-print">
                                  <select
                                    value={paymentMethodDraft}
                                    onChange={(e) =>
                                      setPaymentMethodDraft(e.target.value as PaymentMethod)
                                    }
                                    className="px-2 py-1 text-[11px] font-bold rounded bg-zinc-950 border border-zinc-700 text-yellow-300"
                                  >
                                    <option value="JAZZCASH">JAZZCASH</option>
                                    <option value="EASYPAISA">EASYPAISA</option>
                                    <option value="CARD">CARD</option>
                                    <option value="COD">COD</option>
                                  </select>
                                  <input
                                    type="text"
                                    value={paymentRefDraft}
                                    onChange={(e) => setPaymentRefDraft(e.target.value)}
                                    placeholder="TXN Ref ID"
                                    className="w-28 px-2 py-1 text-[11px] font-mono-tabular rounded bg-zinc-950 border border-zinc-700 text-white"
                                  />
                                  <select
                                    value={paymentStatusDraft}
                                    onChange={(e) =>
                                      setPaymentStatusDraft(e.target.value as PaymentStatus)
                                    }
                                    className="px-2 py-1 text-[11px] font-bold rounded bg-zinc-950 border border-zinc-700 text-emerald-300"
                                  >
                                    <option value="paid">Paid</option>
                                    <option value="refunded">Refunded</option>
                                  </select>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await onUpdateOrderPayment(ord.id, {
                                        paymentMethod: paymentMethodDraft,
                                        paymentRef: paymentRefDraft.trim() || undefined,
                                        paymentStatus: paymentStatusDraft,
                                      });
                                      setEditingPaymentOrderId(null);
                                    }}
                                    className="px-2 py-1 rounded bg-yellow-400 text-zinc-950 text-[11px] font-extrabold"
                                  >
                                    Save
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35 text-[10px] font-extrabold text-emerald-300">
                                      {ord.paymentMethod}
                                    </span>
                                    <span
                                      className={`text-[10px] font-extrabold uppercase ${
                                        ord.paymentStatus === 'refunded'
                                          ? 'text-rose-400'
                                          : 'text-yellow-300'
                                      }`}
                                    >
                                      {ord.paymentStatus}
                                    </span>
                                  </div>
                                  <div className="text-[11px] font-mono-tabular text-zinc-400">
                                    Ref: {ord.paymentRef || 'Verified Online'}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 font-mono-tabular text-[11px] font-bold text-emerald-300">
                                Rs. 0 (Online)
                              </span>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateOrderPayment(ord.id, {
                                    officeSettled: !ord.officeSettled,
                                  })
                                }
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border transition-colors ${
                                  ord.officeSettled
                                    ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                                    : 'bg-amber-500/15 border-amber-500/35 text-yellow-300 hover:bg-amber-500 hover:text-zinc-950'
                                }`}
                              >
                                {ord.officeSettled ? 'Paid to Office ✓' : 'Mark Office Settled'}
                              </button>
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular font-extrabold text-emerald-400 whitespace-nowrap">
                              {formatPkr(ord.totalPkr)}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap no-print">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isEditingPay) {
                                      setEditingPaymentOrderId(null);
                                    } else {
                                      setEditingPaymentOrderId(ord.id);
                                      setPaymentMethodDraft(ord.paymentMethod);
                                      setPaymentRefDraft(ord.paymentRef || '');
                                      setPaymentStatusDraft(ord.paymentStatus);
                                    }
                                  }}
                                  className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-amber-300 hover:border-yellow-400"
                                  title="Edit payment method or reference"
                                >
                                  {isEditingPay ? (
                                    <X className="w-3.5 h-3.5" />
                                  ) : (
                                    <Edit3 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePrintAdminOrderSlip(ord)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-[11px] font-bold text-zinc-200 hover:border-amber-400 hover:text-yellow-300 whitespace-nowrap"
                                  title="Print Invoice"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  Print Invoice
                                </button>
                              </div>
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

          {/* 2. Business Owners Daily & Monthly Payment Report (Paid / Pending) Section */}
          <section className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 bg-[#0E0E14] border border-amber-500/35 rounded-2xl space-y-1 shadow-xl">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                  <span>Delivered Orders Payable to Owners ({activeBizPeriodLabel})</span>
                  <Building2 className="w-4 h-4 text-yellow-400" />
                </div>
                <p className="text-2xl font-extrabold font-mono-tabular text-yellow-400">
                  {formatPkr(businessPayoutSummary.totalPayable)}
                </p>
                <p className="text-xs font-semibold text-zinc-400">
                  {businessPayoutSummary.totalDeliveredOrders} delivered orders across{' '}
                  {businessPayoutRows.length} businesses
                </p>
              </div>
              <div className="p-5 bg-[#0E0E14] border border-emerald-500/30 rounded-2xl space-y-1 shadow-xl">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                  <span>Paid to Business Owners</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-2xl font-extrabold font-mono-tabular text-emerald-400">
                  {formatPkr(businessPayoutSummary.totalPaid)}
                </p>
                <p className="text-xs font-semibold text-zinc-400">
                  {businessPayoutSummary.paidCount} businesses settled
                </p>
              </div>
              <div className="p-5 bg-[#0E0E14] border border-zinc-800 rounded-2xl space-y-1 shadow-xl">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                  <span>Pending Business Payments</span>
                  <Coins className="w-4 h-4 text-amber-400" />
                </div>
                <p className="text-2xl font-extrabold font-mono-tabular text-white">
                  {formatPkr(businessPayoutSummary.totalPending)}
                </p>
                <p className="text-xs font-semibold text-zinc-400">
                  {businessPayoutSummary.pendingCount} businesses awaiting payout
                </p>
              </div>
            </div>

            <div className="bg-[#0E0E14] border border-amber-500/30 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-extrabold text-white">
                    Business Owners Daily &amp; Monthly Delivered Order Payment Report ({activeBizPeriodLabel})
                  </h2>
                  <p className="text-xs font-semibold text-zinc-400">
                    Calculates payable amount strictly from DELIVERED orders for each business owner. Adjust fees, save reference, and mark Paid or Pending.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 no-print">
                  <div className="inline-flex rounded-xl bg-zinc-950 p-1 border border-zinc-800">
                    {(['daily', 'monthly', 'range', 'all'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setBizReportMode(mode)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold capitalize transition-colors ${
                          bizReportMode === mode
                            ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {mode === 'daily'
                          ? 'Daily Report'
                          : mode === 'monthly'
                            ? 'Monthly Report'
                            : mode === 'range'
                              ? 'Custom Range'
                              : 'All Dates'}
                      </button>
                    ))}
                  </div>
                  {bizReportMode === 'daily' && (
                    <input
                      type="date"
                      value={reportDate}
                      onChange={(e) => setReportDate(e.target.value)}
                      className="px-3 py-1.5 text-xs font-mono-tabular font-bold bg-zinc-950 text-white rounded-xl border border-zinc-700"
                    />
                  )}
                  {bizReportMode === 'monthly' && (
                    <input
                      type="month"
                      value={reportMonth}
                      onChange={(e) => setReportMonth(e.target.value)}
                      className="px-3 py-1.5 text-xs font-mono-tabular font-bold bg-zinc-950 text-white rounded-xl border border-zinc-700"
                    />
                  )}
                  {bizReportMode === 'range' && (
                    <DateRangePicker
                      startDate={bizStartDate}
                      endDate={bizEndDate}
                      onChange={({ startDate, endDate }) => {
                        setBizStartDate(startDate);
                        setBizEndDate(endDate);
                      }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        `hsp-business-${bizReportMode}-payouts-${activeBizPeriodKey}.csv`,
                        [
                          'Business Name',
                          'City',
                          'Login ID',
                          'Period',
                          'Sale Orders Count',
                          'Gross Sale Orders (PKR)',
                          'Deduction (PKR)',
                          'Net Payable to Owner (PKR)',
                          'Payout Method',
                          'Payment Ref',
                          'Status',
                        ],
                        filteredBusinessPayouts.map(({ record, orderCount }) => [
                          record.restaurantName,
                          record.city,
                          record.businessLoginId || '',
                          record.monthKey,
                          orderCount,
                          record.grossSubtotalPkr,
                          record.commissionPkr,
                          record.netPayablePkr,
                          record.payoutMethod,
                          record.paymentRef || '',
                          record.status.toUpperCase(),
                        ])
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-amber-400 hover:text-yellow-300"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Payouts CSV
                  </button>
                </div>
              </div>

              <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex flex-wrap items-center gap-2.5 no-print">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-yellow-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={bizPayoutSearch}
                    onChange={(e) => setBizPayoutSearch(e.target.value)}
                    placeholder="Search business name, city, Login ID, payout ref..."
                    className="w-full pl-9 pr-3 py-2 text-xs font-semibold bg-zinc-950 text-white placeholder:text-zinc-500 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <select
                  value={bizPayoutStatusFilter}
                  onChange={(e) =>
                    setBizPayoutStatusFilter(e.target.value as 'ALL' | 'paid' | 'pending')
                  }
                  className="px-3 py-2 text-xs font-bold rounded-xl bg-zinc-950 border border-zinc-700 text-yellow-300"
                >
                  <option value="ALL">All Paid &amp; Pending</option>
                  <option value="pending">Pending Only</option>
                  <option value="paid">Paid Only</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-zinc-900/70 border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
                      <th className="py-3 px-4 font-extrabold">Business &amp; Login ID</th>
                      <th className="py-3 px-4 font-extrabold text-right">Delivered Orders &amp; Amount</th>
                      <th className="py-3 px-4 font-extrabold">Fee / Deduction</th>
                      <th className="py-3 px-4 font-extrabold text-right">Amount to Pay Owner</th>
                      <th className="py-3 px-4 font-extrabold">Payout Method &amp; Ref</th>
                      <th className="py-3 px-4 font-extrabold">Status</th>
                      <th className="py-3 px-4 font-extrabold text-right no-print">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80">
                    {filteredBusinessPayouts.map(
                      ({
                        record,
                        orderCount,
                        inProgressCount,
                        onlineSubtotalPkr,
                        codSubtotalPkr,
                      }) => {
                        const draft = payoutEdits[record.id] || {};
                        const commission = draft.commissionPkr ?? record.commissionPkr;
                        const payoutMethod = draft.payoutMethod ?? record.payoutMethod;
                        const paymentRef = draft.paymentRef ?? (record.paymentRef || '');
                        const net = Math.max(0, record.grossSubtotalPkr - commission);
                        const isPaid = record.status === 'paid';

                        const buildPayout = (nextStatus: 'paid' | 'pending'): BusinessPayout => ({
                          ...record,
                          commissionPkr: commission,
                          netPayablePkr: net,
                          payoutMethod,
                          paymentRef: paymentRef.trim() || undefined,
                          status: nextStatus,
                          updatedAt: new Date().toISOString(),
                          ...(nextStatus === 'paid' ? { paidAt: new Date().toISOString() } : {}),
                        });

                        return (
                          <tr key={record.id} className="hover:bg-zinc-900/40">
                            <td className="py-3.5 px-4">
                              <p className="font-extrabold text-white">{record.restaurantName}</p>
                              <p className="text-[11px] text-zinc-400">
                                {record.city}
                                {record.businessLoginId ? ` · ID ${record.businessLoginId}` : ''}
                              </p>
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono-tabular">
                              <p className="font-extrabold text-white">
                                {formatPkr(record.grossSubtotalPkr)}
                              </p>
                              <p className="text-[10px] text-emerald-300">
                                {orderCount} delivered · Onl {formatPkr(onlineSubtotalPkr)} / COD{' '}
                                {formatPkr(codSubtotalPkr)}
                              </p>
                              {inProgressCount > 0 && (
                                <p className="text-[10px] text-zinc-500">
                                  ({inProgressCount} in progress — payable once delivered)
                                </p>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <input
                                type="number"
                                min={0}
                                value={commission}
                                onChange={(e) =>
                                  setPayoutEdits((prev) => ({
                                    ...prev,
                                    [record.id]: {
                                      ...prev[record.id],
                                      commissionPkr: Math.max(0, Number(e.target.value) || 0),
                                    },
                                  }))
                                }
                                className="w-24 px-2 py-1.5 text-xs font-mono-tabular font-bold rounded-lg bg-zinc-950 border border-zinc-700 text-rose-300"
                              />
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono-tabular font-extrabold text-yellow-400 whitespace-nowrap">
                              {formatPkr(net)}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <select
                                  value={payoutMethod}
                                  onChange={(e) =>
                                    setPayoutEdits((prev) => ({
                                      ...prev,
                                      [record.id]: {
                                        ...prev[record.id],
                                        payoutMethod: e.target.value as BusinessPayout['payoutMethod'],
                                      },
                                    }))
                                  }
                                  className="px-2 py-1.5 text-xs font-bold rounded-lg bg-zinc-950 border border-zinc-700 text-white"
                                >
                                  <option value="BANK">Bank Transfer</option>
                                  <option value="JAZZCASH">JazzCash</option>
                                  <option value="EASYPAISA">EasyPaisa</option>
                                  <option value="CASH">Office Cash</option>
                                </select>
                                <input
                                  type="text"
                                  value={paymentRef}
                                  onChange={(e) =>
                                    setPayoutEdits((prev) => ({
                                      ...prev,
                                      [record.id]: {
                                        ...prev[record.id],
                                        paymentRef: e.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="Ref / Slip #"
                                  className="w-28 px-2 py-1.5 text-xs font-mono-tabular rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200"
                                />
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase border ${
                                  isPaid
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                                    : 'bg-amber-500/15 text-yellow-300 border-amber-500/35'
                                }`}
                              >
                                {isPaid ? 'Paid' : 'Pending'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap no-print">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setIndividualReportPreview({
                                      type: 'business',
                                      targetId: record.restaurantId,
                                    })
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 hover:border-amber-400 hover:text-yellow-300 text-xs font-bold inline-flex items-center gap-1"
                                  title="Check & Print individual business owner report"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  Report
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onSaveBusinessPayout(buildPayout(record.status))}
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold hover:border-amber-400"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onSaveBusinessPayout(buildPayout(isPaid ? 'pending' : 'paid'))
                                  }
                                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                                    isPaid
                                      ? 'bg-zinc-900 border border-amber-500/40 text-amber-300 hover:bg-amber-500/15'
                                      : 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 hover:brightness-105'
                                  }`}
                                >
                                  {isPaid ? 'Mark Pending' : 'Mark Paid'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 3. Business Sale Orders & Printable Daily / Monthly Reports in Admin */}
          <section className="bg-[#0E0E14] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Delivered Orders to Pay Business Owners — {activeBizPeriodLabel} ({adminDailyReportTotals.validCount} delivered)
                </h2>
                <p className="text-xs font-semibold text-zinc-400">
                  Itemized delivered orders showing business owner order payment ({formatPkr(adminDailyReportTotals.subtotalPkr)}) vs total customer bill.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      `hsp-admin-business-delivered-orders-${bizReportMode}-${activeBizPeriodKey}.csv`,
                      [
                        'Order Code',
                        'Date',
                        'Business',
                        'City',
                        'Customer',
                        'Method',
                        'Delivered Order Payable to Business (PKR)',
                        'Delivery & Tip (PKR)',
                        'Total Bill (PKR)',
                        'Status',
                      ],
                      adminDailyReportOrders.map((o) => [
                        o.orderCode,
                        o.createdAt,
                        o.restaurantName,
                        o.city,
                        o.customerName,
                        o.paymentMethod,
                        o.status === 'delivered' ? o.subtotalPkr || o.totalPkr : 0,
                        (o.deliveryFeePkr || 0) + (o.tipPkr || 0),
                        o.totalPkr,
                        o.status,
                      ])
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-amber-400 hover:text-yellow-300"
                >
                  <Download className="w-3.5 h-3.5" />
                  Delivered Orders CSV
                </button>
                <button
                  type="button"
                  onClick={handlePrintAdminDailyReport}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Delivered Payment Report
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex flex-wrap items-center gap-2.5 no-print">
              <div className="inline-flex rounded-xl bg-zinc-950 p-1 border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setBizReportDeliveredOnly(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                    bizReportDeliveredOnly
                      ? 'bg-emerald-500 text-zinc-950'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Delivered Only (Payable)
                </button>
                <button
                  type="button"
                  onClick={() => setBizReportDeliveredOnly(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                    !bizReportDeliveredOnly
                      ? 'bg-zinc-800 text-yellow-300'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Include In-Progress
                </button>
              </div>

              <select
                value={reportBizId}
                onChange={(e) => setReportBizId(e.target.value)}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-zinc-950 border border-amber-500/35 text-yellow-300"
              >
                <option value="ALL">All Businesses</option>
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.city})
                  </option>
                ))}
              </select>

              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-yellow-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={bizReportSearch}
                  onChange={(e) => setBizReportSearch(e.target.value)}
                  placeholder="Search order code, customer, store, or item..."
                  className="w-full pl-9 pr-3 py-2 text-xs font-semibold bg-zinc-950 text-white placeholder:text-zinc-500 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center gap-2 text-xs font-extrabold text-yellow-300 bg-zinc-950 px-3 py-2 rounded-xl border border-zinc-800">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>{activeBizPeriodLabel}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-900/70 border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
                    <th className="py-3 px-4 font-extrabold">Order</th>
                    <th className="py-3 px-4 font-extrabold">Business</th>
                    <th className="py-3 px-4 font-extrabold">Customer</th>
                    <th className="py-3 px-4 font-extrabold">Payment</th>
                    <th className="py-3 px-4 font-extrabold text-right">Order Payable (Owner)</th>
                    <th className="py-3 px-4 font-extrabold text-right">Total Bill</th>
                    <th className="py-3 px-4 font-extrabold">Status</th>
                    <th className="py-3 px-4 font-extrabold text-right no-print">Print Slip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {adminDailyReportOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-zinc-900/40">
                      <td className="py-3 px-4 font-mono-tabular font-extrabold text-yellow-400 whitespace-nowrap">
                        <p>{ord.orderCode}</p>
                        <p className="text-[10px] text-zinc-500">
                          {(ord.createdAt || '').slice(0, 10)}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-bold text-white">{ord.restaurantName}</td>
                      <td className="py-3 px-4 text-zinc-300">{ord.customerName}</td>
                      <td className="py-3 px-4 whitespace-nowrap font-bold text-emerald-300">
                        {ord.paymentMethod}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-extrabold text-yellow-300 whitespace-nowrap">
                        {formatPkr(ord.subtotalPkr || ord.totalPkr)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-zinc-300 whitespace-nowrap">
                        {formatPkr(ord.totalPkr)}
                      </td>
                      <td className="py-3 px-4 capitalize font-bold text-amber-300 whitespace-nowrap">
                        {ord.status.replace(/_/g, ' ')}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap no-print">
                        <button
                          type="button"
                          onClick={() => handlePrintAdminOrderSlip(ord)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 hover:border-amber-400 hover:text-yellow-300 font-bold"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Print Invoice
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      </div>

      {/* Print-Only Business Owners Daily/Monthly Payout & Sale Orders Report */}
      {adminPrintDailyReport && (
        <div className="print-only p-6 border border-slate-300 rounded-xl space-y-5">
          <div className="border-b border-slate-300 pb-3 flex justify-between items-start">
            <div>
              <h2 className="text-xl font-extrabold">
                HSP delivery — Business Owners {bizReportMode.toUpperCase()} Report &amp; Sale Orders
              </h2>
              <p className="text-xs">
                Filter:{' '}
                {reportBizId === 'ALL'
                  ? 'All Businesses'
                  : restaurants.find((r) => r.id === reportBizId)?.name || 'Store'}{' '}
                · Period: {activeBizPeriodLabel}
              </p>
            </div>
            <div className="text-right text-xs">
              <p>Sale Orders: {adminDailyReportTotals.validCount}</p>
              <p className="font-bold">
                Owner Order Sales Total: {formatPkr(adminDailyReportTotals.subtotalPkr)}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-extrabold uppercase mb-1.5">
              Business Owners Payable Summary ({activeBizPeriodLabel})
            </h3>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="py-1.5 text-left">Business</th>
                  <th className="py-1.5 text-right">Orders</th>
                  <th className="py-1.5 text-right">Sale Orders (PKR)</th>
                  <th className="py-1.5 text-right">Deduction</th>
                  <th className="py-1.5 text-right">Net Payable</th>
                  <th className="py-1.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredBusinessPayouts
                  .filter(({ record }) => reportBizId === 'ALL' || record.restaurantId === reportBizId)
                  .map(({ record, orderCount }) => (
                    <tr key={record.id} className="border-b border-slate-200">
                      <td className="py-1.5 font-bold">{record.restaurantName}</td>
                      <td className="py-1.5 text-right font-mono-tabular">{orderCount}</td>
                      <td className="py-1.5 text-right font-mono-tabular">
                        {formatPkr(record.grossSubtotalPkr)}
                      </td>
                      <td className="py-1.5 text-right font-mono-tabular">
                        {formatPkr(record.commissionPkr)}
                      </td>
                      <td className="py-1.5 text-right font-mono-tabular font-bold">
                        {formatPkr(record.netPayablePkr)}
                      </td>
                      <td className="py-1.5 text-right uppercase">{record.status}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-xs font-extrabold uppercase mb-1.5">
              Itemized Sale Orders ({adminDailyReportOrders.length})
            </h3>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="py-1.5 text-left">Order</th>
                  <th className="py-1.5 text-left">Business</th>
                  <th className="py-1.5 text-left">Customer</th>
                  <th className="py-1.5 text-left">Method</th>
                  <th className="py-1.5 text-left">Status</th>
                  <th className="py-1.5 text-right">Order Payable</th>
                </tr>
              </thead>
              <tbody>
                {adminDailyReportOrders.map((ord) => (
                  <tr key={ord.id} className="border-b border-slate-200">
                    <td className="py-1.5 font-mono-tabular font-bold">{ord.orderCode}</td>
                    <td className="py-1.5">{ord.restaurantName}</td>
                    <td className="py-1.5">{ord.customerName}</td>
                    <td className="py-1.5">{ord.paymentMethod}</td>
                    <td className="py-1.5 capitalize">{ord.status.replace(/_/g, ' ')}</td>
                    <td className="py-1.5 text-right font-mono-tabular">
                      {formatPkr(ord.subtotalPkr || ord.totalPkr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-sm font-extrabold flex justify-between pt-2 border-t border-slate-300">
            <span>
              Online Sales: {formatPkr(adminDailyReportTotals.onlinePkr)} · COD Sales:{' '}
              {formatPkr(adminDailyReportTotals.codPkr)}
            </span>
            <span className="font-mono-tabular">
              Payable Store Sales: {formatPkr(adminDailyReportTotals.subtotalPkr)}
            </span>
          </div>
        </div>
      )}

      {/* Print-Only Riders Daily/Monthly Payout & Distance (KM) Report */}
      {adminPrintRiderReport && (
        <div className="print-only p-6 border border-slate-300 rounded-xl space-y-5 bg-white text-slate-900">
          <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-start gap-4">
            <div>
              <h2 className="text-xl font-extrabold">
                HSP delivery — Riders {riderReportMode.toUpperCase()} Payout &amp; Distance Report
              </h2>
              <p className="text-xs text-slate-600">
                Period: {riderPeriodLabel} ·{' '}
                {riderReportRiderId === 'ALL'
                  ? 'All Riders'
                  : riders.find((r) => r.id === riderReportRiderId)?.name || 'Rider'}
              </p>
            </div>
            <div className="text-right text-xs space-y-0.5">
              <p>Delivered Trips: <strong>{riderReportData.totalTrips}</strong></p>
              <p className="font-mono-tabular">
                Total Distance Traveled:{' '}
                <strong>{riderReportData.totalDistanceKm.toFixed(1)} km</strong> (Avg{' '}
                {riderReportData.avgDistancePerTripKm.toFixed(1)} km/order)
              </p>
              <p className="font-bold">
                Total Payable to Riders: {formatPkr(riderReportData.totalPayableToRiders)}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-extrabold uppercase mb-1.5 text-slate-700">
              Rider Summary — Distance Traveled &amp; Payouts
            </h3>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="py-1.5 text-left">Rider &amp; ID</th>
                  <th className="py-1.5 text-right">Trips</th>
                  <th className="py-1.5 text-right">Total KM</th>
                  <th className="py-1.5 text-right">Delivery Pay</th>
                  <th className="py-1.5 text-right">Tips</th>
                  {riderReportMode === 'monthly' && (
                    <th className="py-1.5 text-right">Base+Bonus</th>
                  )}
                  <th className="py-1.5 text-right">COD Cash</th>
                  <th className="py-1.5 text-right">Payable Total</th>
                  <th className="py-1.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {riderReportData.rows.map((row) => (
                  <tr key={row.rider.id} className="border-b border-slate-200">
                    <td className="py-1.5 font-bold">
                      {row.rider.name} ({row.rider.loginId})
                    </td>
                    <td className="py-1.5 text-right font-mono-tabular">{row.tripsCount}</td>
                    <td className="py-1.5 text-right font-mono-tabular font-bold">
                      {row.totalDistanceKm.toFixed(1)} km
                    </td>
                    <td className="py-1.5 text-right font-mono-tabular">
                      {formatPkr(row.deliveryPayPkr)}
                    </td>
                    <td className="py-1.5 text-right font-mono-tabular">
                      {formatPkr(row.tipsPkr)}
                    </td>
                    {riderReportMode === 'monthly' && (
                      <td className="py-1.5 text-right font-mono-tabular">
                        {formatPkr(row.monthlyBasePkr + row.walletBonusPkr)}
                      </td>
                    )}
                    <td className="py-1.5 text-right font-mono-tabular">
                      {formatPkr(row.codCashPkr)}
                    </td>
                    <td className="py-1.5 text-right font-mono-tabular font-bold">
                      {formatPkr(row.netPayableToRiderPkr)}
                    </td>
                    <td className="py-1.5 text-right uppercase">{row.status}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-400 font-extrabold">
                  <td className="py-2">FLEET TOTAL</td>
                  <td className="py-2 text-right font-mono-tabular">
                    {riderReportData.totalTrips}
                  </td>
                  <td className="py-2 text-right font-mono-tabular">
                    {riderReportData.totalDistanceKm.toFixed(1)} km
                  </td>
                  <td className="py-2 text-right font-mono-tabular">
                    {formatPkr(riderReportData.rows.reduce((s, r) => s + r.deliveryPayPkr, 0))}
                  </td>
                  <td className="py-2 text-right font-mono-tabular">
                    {formatPkr(riderReportData.rows.reduce((s, r) => s + r.tipsPkr, 0))}
                  </td>
                  {riderReportMode === 'monthly' && (
                    <td className="py-2 text-right font-mono-tabular">
                      {formatPkr(
                        riderReportData.rows.reduce(
                          (s, r) => s + r.monthlyBasePkr + r.walletBonusPkr,
                          0
                        )
                      )}
                    </td>
                  )}
                  <td className="py-2 text-right font-mono-tabular">
                    {formatPkr(riderReportData.totalCodCash)}
                  </td>
                  <td className="py-2 text-right font-mono-tabular">
                    {formatPkr(riderReportData.totalPayableToRiders)}
                  </td>
                  <td className="py-2 text-right">—</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {riderReportData.filteredTrips.length > 0 && (
            <div>
              <h3 className="text-xs font-extrabold uppercase mb-1.5 text-slate-700">
                Itemized Delivered Orders &amp; Per-Order Distance ({riderReportData.filteredTrips.length} orders)
              </h3>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-300">
                    <th className="py-1.5 text-left">Order</th>
                    <th className="py-1.5 text-left">Rider</th>
                    <th className="py-1.5 text-left">Pickup → Drop-off</th>
                    <th className="py-1.5 text-right">Distance (km)</th>
                    <th className="py-1.5 text-right">Rider Total</th>
                  </tr>
                </thead>
                <tbody>
                  {riderReportData.filteredTrips.map((t) => {
                    const rObj = riders.find((r) => r.id === t.riderId);
                    return (
                      <tr key={t.id} className="border-b border-slate-200">
                        <td className="py-1 font-mono-tabular font-bold">{t.orderCode}</td>
                        <td className="py-1">{rObj?.name || t.riderId}</td>
                        <td className="py-1">
                          {t.restaurantName} → {t.dropoffArea}
                        </td>
                        <td className="py-1 text-right font-mono-tabular font-bold">
                          {t.distanceKm.toFixed(1)} km
                        </td>
                        <td className="py-1 text-right font-mono-tabular">
                          {formatPkr(t.deliveryFeePkr + t.tipPkr)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-400 font-extrabold">
                    <td colSpan={3} className="py-1.5">
                      TOTAL DELIVERED DISTANCE &amp; TRIP EARNINGS
                    </td>
                    <td className="py-1.5 text-right font-mono-tabular">
                      {riderReportData.filteredTripsTotalDistanceKm.toFixed(1)} km
                    </td>
                    <td className="py-1.5 text-right font-mono-tabular">
                      {formatPkr(
                        riderReportData.filteredTripsTotalDeliveryPay +
                          riderReportData.filteredTripsTotalTips
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="text-sm font-extrabold flex justify-between pt-2 border-t border-slate-300">
            <span>
              COD Cash Held (Online Rs. 0): {formatPkr(riderReportData.totalCodCash)}
            </span>
            <span className="font-mono-tabular">
              Paid: {formatPkr(riderReportData.totalPaidToRiders)} / Total Payable:{' '}
              {formatPkr(riderReportData.totalPayableToRiders)}
            </span>
          </div>
        </div>
      )}

      {/* Print-Only Individual Order Invoice Receipt (Step 1: Clean Receipt Layout) */}
      {adminPrintOrder && (
        <div className="print-only max-w-[680px] mx-auto p-6 border border-slate-300 rounded-xl bg-white text-slate-900 space-y-5">
          {/* Receipt Brand & Invoice Header */}
          <div className="border-b-2 border-slate-900 pb-4 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
                HSP delivery
              </h2>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Official Order Invoice &amp; Delivery Receipt
              </p>
              <p className="text-xs text-slate-600">
                Channel:{' '}
                <strong>
                  {adminPrintOrder.orderSource === 'whatsapp'
                    ? 'WhatsApp Custom Order'
                    : 'App Store Order'}
                </strong>{' '}
                · City: <strong>{adminPrintOrder.city}</strong>
              </p>
            </div>
            <div className="text-right text-xs space-y-1">
              <p className="text-base font-mono-tabular font-extrabold text-slate-900">
                {adminPrintOrder.orderCode}
              </p>
              <p className="text-slate-600">
                {new Date(adminPrintOrder.createdAt).toLocaleString('en-PK', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
              <p className="font-bold uppercase text-slate-800">
                Status: {adminPrintOrder.status.replace(/_/g, ' ')}
              </p>
            </div>
          </div>

          {/* Customer Info & Store / Dispatch Details */}
          <div className="grid grid-cols-2 gap-4 text-xs border-b border-slate-200 pb-4">
            <div className="space-y-1">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Customer Information
              </p>
              <p className="font-bold text-slate-900 text-sm">{adminPrintOrder.customerName}</p>
              <p className="font-mono-tabular text-slate-700">
                Mobile: {adminPrintOrder.customerPhone || 'N/A'}
              </p>
              <p className="text-slate-700 leading-relaxed">
                Address: {adminPrintOrder.deliveryAddress}
              </p>
              <p className="font-mono-tabular text-[11px] text-slate-500">
                GPS Pin: {adminPrintOrder.deliveryLat.toFixed(5)},{' '}
                {adminPrintOrder.deliveryLng.toFixed(5)}
                {adminPrintOrder.distanceKm ? ` (${adminPrintOrder.distanceKm.toFixed(1)} km)` : ''}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Store &amp; Dispatch Details
              </p>
              <p className="font-bold text-slate-900 text-sm">{adminPrintOrder.restaurantName}</p>
              <p className="text-slate-700">
                Payment:{' '}
                <strong>
                  {adminPrintOrder.whatsappAmountAlreadyPaid
                    ? 'WhatsApp — Amount Already Paid'
                    : `${adminPrintOrder.paymentMethod} (${adminPrintOrder.paymentStatus.replace(/_/g, ' ')})`}
                </strong>
              </p>
              {adminPrintOrder.paymentRef && (
                <p className="font-mono-tabular text-slate-600">
                  Ref: {adminPrintOrder.paymentRef}
                </p>
              )}
              {adminPrintOrder.riderName && (
                <p className="text-slate-700">
                  Rider: <strong>{adminPrintOrder.riderName}</strong>
                  {adminPrintOrder.riderPhone ? ` (${adminPrintOrder.riderPhone})` : ''}
                </p>
              )}
            </div>
          </div>

          {/* WhatsApp Note / Delivery Notes / Photo */}
          {(adminPrintOrder.whatsappItemNote ||
            adminPrintOrder.deliveryNotes ||
            adminPrintOrder.whatsappItemPhoto) && (
            <div className="flex items-start gap-4 border-b border-slate-200 pb-4 text-xs">
              {adminPrintOrder.whatsappItemPhoto && (
                <img
                  src={adminPrintOrder.whatsappItemPhoto}
                  alt="Order item attachment"
                  className="w-20 h-20 object-cover rounded-lg border border-slate-300 shrink-0"
                />
              )}
              <div className="space-y-1">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  Order Note / Instructions
                </p>
                <p className="text-slate-800 leading-relaxed">
                  {adminPrintOrder.whatsappItemNote || adminPrintOrder.deliveryNotes}
                </p>
              </div>
            </div>
          )}

          {/* Itemized Order Table */}
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
              Order Items
            </p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-300 text-slate-700">
                  <th className="py-2 text-left font-extrabold">Qty</th>
                  <th className="py-2 text-left font-extrabold">Item Description</th>
                  <th className="py-2 text-right font-extrabold">Unit Price</th>
                  <th className="py-2 text-right font-extrabold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {adminPrintOrder.items.map((it, idx) => (
                  <tr key={idx} className="border-b border-slate-200">
                    <td className="py-2 font-mono-tabular font-bold">{it.quantity}×</td>
                    <td className="py-2 font-semibold text-slate-900">
                      {it.name}
                      {it.varietyLabel ? ` (${it.varietyLabel})` : ''}
                    </td>
                    <td className="py-2 text-right font-mono-tabular text-slate-700">
                      {formatPkr(it.pricePkr)}
                    </td>
                    <td className="py-2 text-right font-mono-tabular font-bold text-slate-900">
                      {formatPkr(it.pricePkr * it.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial Breakdown */}
          <div className="space-y-1.5 text-xs pt-2">
            <div className="flex justify-between text-slate-700">
              <span>Items Subtotal</span>
              <span className="font-mono-tabular font-semibold">
                {formatPkr(adminPrintOrder.subtotalPkr)}
              </span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>
                Delivery Charges
                {adminPrintOrder.distanceKm ? ` (${adminPrintOrder.distanceKm.toFixed(1)} km)` : ''}
              </span>
              <span className="font-mono-tabular font-semibold">
                {formatPkr(adminPrintOrder.deliveryFeePkr)}
              </span>
            </div>
            {(adminPrintOrder.tipPkr ?? 0) > 0 && (
              <div className="flex justify-between text-slate-700">
                <span>Rider Tip</span>
                <span className="font-mono-tabular font-semibold">
                  {formatPkr(adminPrintOrder.tipPkr || 0)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center text-base font-extrabold text-slate-900 pt-2.5 mt-2 border-t-2 border-slate-900">
              <span>Grand Total (PKR)</span>
              <span className="font-mono-tabular">{formatPkr(adminPrintOrder.totalPkr)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 pt-1">
              <span>Rider Wallet Delivery Pay</span>
              <span className="font-mono-tabular">
                {formatPkr(
                  adminPrintOrder.riderEarningPkr ??
                    calculateRiderDeliveryEarningPkr(adminPrintOrder.distanceKm ?? 3, liveDeliveryRates)
                )}
              </span>
            </div>
          </div>

          {/* Receipt Footer */}
          <div className="border-t border-dashed border-slate-300 pt-3 text-center text-[11px] text-slate-500">
            Thank you for choosing HSP delivery · Official Computer-Generated Invoice
          </div>
        </div>
      )}

      {/* Interactive Individual Report Preview Modal (Check & Print Staff, Rider, or Business Owner) */}
      {individualReportPreview &&
        (() => {
          const { type, targetId } = individualReportPreview;
          const staffObj = type === 'staff' ? staffMembers.find((s) => s.id === targetId) : null;
          const staffSalary =
            type === 'staff' ? staffPayrollRows.find((s) => s.targetId === targetId) : null;
          const riderRow =
            type === 'rider' ? riderReportData.rows.find((r) => r.rider.id === targetId) : null;
          const riderFallback =
            type === 'rider' ? riders.find((r) => r.id === targetId) : null;
          const riderSalary =
            type === 'rider' ? riderPayrollRows.find((r) => r.targetId === targetId) : null;
          const bizObj = type === 'business' ? restaurants.find((b) => b.id === targetId) : null;
          const bizPayoutRow =
            type === 'business'
              ? businessPayoutRows.find((r) => r.record.restaurantId === targetId)
              : null;

          const titleName =
            type === 'staff'
              ? staffObj?.name || 'Employee'
              : type === 'rider'
                ? riderRow?.rider.name || riderFallback?.name || 'Rider'
                : bizObj?.name || 'Business Owner';

          return (
            <div
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 no-print"
              onClick={() => setIndividualReportPreview(null)}
            >
              <div
                className="w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-[#0E0E14] border border-amber-500/45 rounded-2xl shadow-2xl p-6 space-y-5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-4">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-yellow-400">
                      Individual{' '}
                      {type === 'staff'
                        ? 'Staff Employee'
                        : type === 'rider'
                          ? 'Rider Performance & Payout'
                          : 'Business Owner Sales & Settlement'}{' '}
                      Report
                    </p>
                    <h3 className="text-xl font-extrabold text-white mt-0.5">{titleName}</h3>
                    <p className="text-xs font-semibold text-zinc-400 mt-0.5">
                      {type === 'staff'
                        ? `Month: ${currentMonthLabel} · ID ${staffObj?.loginId || ''}`
                        : type === 'rider'
                          ? `Period: ${riderPeriodLabel} · ID ${riderRow?.rider.loginId || riderFallback?.loginId || ''}`
                          : `Period: ${activeBizPeriodLabel} · ID ${bizObj?.businessLoginId || 'Unassigned'}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handlePrintIndividualReport(type, targetId, titleName)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print Report
                    </button>
                    <button
                      type="button"
                      onClick={() => setIndividualReportPreview(null)}
                      className="p-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white"
                      aria-label="Close individual report"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Staff Preview Body */}
                {type === 'staff' && staffObj && (
                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                        <p className="text-zinc-400 font-bold">Role &amp; City</p>
                        <p className="text-sm font-extrabold text-white capitalize mt-0.5">
                          {staffObj.role} · {staffObj.city}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                        <p className="text-zinc-400 font-bold">Base Salary</p>
                        <p className="text-sm font-mono-tabular font-extrabold text-white mt-0.5">
                          {formatPkr(staffSalary?.baseSalaryPkr ?? staffObj.monthlySalaryPkr)}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                        <p className="text-zinc-400 font-bold">Bonus / Deduction</p>
                        <p className="text-sm font-mono-tabular font-extrabold text-emerald-400 mt-0.5">
                          +{formatPkr(staffSalary?.bonusPkr ?? 0)} / -{formatPkr(staffSalary?.deductionPkr ?? 0)}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-zinc-900 border border-amber-500/40">
                        <p className="text-yellow-300 font-bold">Net Payable ({staffSalary?.status || 'pending'})</p>
                        <p className="text-sm font-mono-tabular font-extrabold text-yellow-400 mt-0.5">
                          {formatPkr(staffSalary?.netAmountPkr ?? staffObj.monthlySalaryPkr)}
                        </p>
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1.5">
                      <p className="font-bold text-zinc-300">
                        Phone: <span className="font-mono-tabular text-white">{staffObj.phone}</span> · Email:{' '}
                        <span className="text-white">{staffObj.email || 'Not set'}</span>
                      </p>
                      <p className="font-bold text-zinc-300">
                        Access Status:{' '}
                        <span className={staffObj.active ? 'text-emerald-400' : 'text-rose-400'}>
                          {staffObj.active ? 'Active' : 'Suspended'}
                        </span>
                      </p>
                      <p className="font-bold text-zinc-400 pt-1">
                        Active Permissions:{' '}
                        <span className="text-zinc-200">
                          {PERMISSION_LABELS.filter((p) => staffObj.permissions[p.key])
                            .map((p) => p.label)
                            .join(' · ') || 'Standard View'}
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                {/* Rider Preview Body */}
                {type === 'rider' && (riderRow || riderFallback) && (
                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                        <p className="text-zinc-400 font-bold">Delivered Trips</p>
                        <p className="text-base font-mono-tabular font-extrabold text-white mt-0.5">
                          {riderRow?.tripsCount ?? 0} trips
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-zinc-900 border border-amber-500/40">
                        <p className="text-yellow-300 font-bold">Total KM Traveled</p>
                        <p className="text-base font-mono-tabular font-extrabold text-yellow-300 mt-0.5">
                          {(riderRow?.totalDistanceKm ?? 0).toFixed(1)} km
                        </p>
                        <p className="text-[10px] text-zinc-400 font-mono-tabular">
                          Avg {(riderRow?.avgDistanceKm ?? 0).toFixed(1)} km/order
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                        <p className="text-zinc-400 font-bold">Delivery Pay + Tips</p>
                        <p className="text-base font-mono-tabular font-extrabold text-emerald-400 mt-0.5">
                          {formatPkr((riderRow?.deliveryPayPkr ?? 0) + (riderRow?.tipsPkr ?? 0))}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-zinc-900 border border-amber-500/40">
                        <p className="text-yellow-300 font-bold">Total Payable</p>
                        <p className="text-base font-mono-tabular font-extrabold text-yellow-400 mt-0.5">
                          {formatPkr(riderRow?.netPayableToRiderPkr ?? riderSalary?.netAmountPkr ?? 0)}
                        </p>
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 flex flex-wrap justify-between gap-2">
                      <span className="text-zinc-300">
                        Phone: <strong className="font-mono-tabular text-white">{(riderRow?.rider || riderFallback)?.phone}</strong> · Vehicle:{' '}
                        <strong className="text-white capitalize">{(riderRow?.rider || riderFallback)?.vehicleType} ({(riderRow?.rider || riderFallback)?.vehiclePlate})</strong>
                      </span>
                      <span className="text-amber-300 font-mono-tabular font-bold">
                        COD Cash Held: {formatPkr(riderRow?.codCashPkr ?? 0)} · Monthly Salary:{' '}
                        {formatPkr(riderSalary?.netAmountPkr ?? (riderRow?.rider || riderFallback)?.monthlySalaryPkr ?? 0)} ({riderSalary?.status || 'pending'})
                      </span>
                    </div>
                    {riderRow && riderRow.trips.length > 0 ? (
                      <div className="border border-zinc-800 rounded-xl overflow-hidden">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-zinc-900 border-b border-zinc-800 text-[10px] uppercase text-zinc-400">
                              <th className="py-2 px-3">Order</th>
                              <th className="py-2 px-3">Pickup → Drop-off</th>
                              <th className="py-2 px-3 text-right">Distance</th>
                              <th className="py-2 px-3 text-right">Rider Pay</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800">
                            {riderRow.trips.map((t) => (
                              <tr key={t.id}>
                                <td className="py-2 px-3 font-mono-tabular font-bold text-yellow-400">{t.orderCode}</td>
                                <td className="py-2 px-3 text-zinc-300">{t.restaurantName} → {t.dropoffArea}</td>
                                <td className="py-2 px-3 text-right font-mono-tabular font-bold text-yellow-300">{t.distanceKm.toFixed(1)} km</td>
                                <td className="py-2 px-3 text-right font-mono-tabular font-bold text-emerald-400">{formatPkr(t.deliveryFeePkr + t.tipPkr)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-center text-zinc-500 py-3">
                        No delivered orders recorded for this rider in {riderPeriodLabel}.
                      </p>
                    )}
                  </div>
                )}

                {/* Business Owner Preview Body */}
                {type === 'business' && bizObj && bizPayoutRow && (
                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                        <p className="text-zinc-400 font-bold">Delivered Orders</p>
                        <p className="text-base font-mono-tabular font-extrabold text-white mt-0.5">
                          {bizPayoutRow.orderCount} orders
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                        <p className="text-zinc-400 font-bold">Gross Sales</p>
                        <p className="text-base font-mono-tabular font-extrabold text-white mt-0.5">
                          {formatPkr(bizPayoutRow.record.grossSubtotalPkr)}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-zinc-900 border border-amber-500/40">
                        <p className="text-yellow-300 font-bold">Net Payable</p>
                        <p className="text-base font-mono-tabular font-extrabold text-yellow-400 mt-0.5">
                          {formatPkr(bizPayoutRow.record.netPayablePkr)}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-zinc-900 border border-emerald-500/40">
                        <p className="text-emerald-300 font-bold">Amount Paid</p>
                        <p className="text-base font-mono-tabular font-extrabold text-emerald-400 mt-0.5">
                          {formatPkr(
                            bizPayoutRow.record.status === 'paid'
                              ? bizPayoutRow.record.netPayablePkr
                              : 0
                          )}
                        </p>
                        <p className="text-[10px] text-zinc-400 uppercase font-bold">
                          {bizPayoutRow.record.status} · {bizPayoutRow.record.payoutMethod}
                        </p>
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 flex flex-wrap justify-between gap-2">
                      <span className="text-zinc-300">
                        Address: <strong className="text-white">{bizObj.address}</strong> ({bizObj.city})
                      </span>
                      <span className="font-mono-tabular text-amber-300">
                        Store GPS: {bizObj.lat.toFixed(5)}, {bizObj.lng.toFixed(5)}
                      </span>
                    </div>
                    {bizPayoutRow.deliveredOrders.length > 0 ? (
                      <div className="border border-zinc-800 rounded-xl overflow-hidden">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-zinc-900 border-b border-zinc-800 text-[10px] uppercase text-zinc-400">
                              <th className="py-2 px-3">Order</th>
                              <th className="py-2 px-3">Customer</th>
                              <th className="py-2 px-3">Method</th>
                              <th className="py-2 px-3 text-right">Owner Payable</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800">
                            {bizPayoutRow.deliveredOrders.map((ord) => (
                              <tr key={ord.id}>
                                <td className="py-2 px-3 font-mono-tabular font-bold text-yellow-400">{ord.orderCode}</td>
                                <td className="py-2 px-3 text-white">{ord.customerName}</td>
                                <td className="py-2 px-3 text-zinc-300">{ord.paymentMethod}</td>
                                <td className="py-2 px-3 text-right font-mono-tabular font-bold text-emerald-400">
                                  {formatPkr(ord.subtotalPkr || ord.totalPkr)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-center text-zinc-500 py-3">
                        No delivered orders recorded for {bizObj.name} in {activeBizPeriodLabel}.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* Print-Only Individual Report Sheet (Staff Employee / Rider / Business Owner) */}
      {adminPrintIndividual &&
        (() => {
          const { type, targetId } = adminPrintIndividual;
          const staffObj = type === 'staff' ? staffMembers.find((s) => s.id === targetId) : null;
          const staffSalary =
            type === 'staff' ? staffPayrollRows.find((s) => s.targetId === targetId) : null;
          const riderRow =
            type === 'rider' ? riderReportData.rows.find((r) => r.rider.id === targetId) : null;
          const riderFallback =
            type === 'rider' ? riders.find((r) => r.id === targetId) : null;
          const riderSalary =
            type === 'rider' ? riderPayrollRows.find((r) => r.targetId === targetId) : null;
          const bizObj = type === 'business' ? restaurants.find((b) => b.id === targetId) : null;
          const bizPayoutRow =
            type === 'business'
              ? businessPayoutRows.find((r) => r.record.restaurantId === targetId)
              : null;

          return (
            <div className="print-only max-w-[720px] mx-auto p-6 border border-slate-300 rounded-xl bg-white text-slate-900 space-y-5">
              <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-start gap-4">
                <div>
                  <h2 className="text-xl font-extrabold">
                    HSP delivery — Individual{' '}
                    {type === 'staff'
                      ? 'Staff Employee Salary & Profile'
                      : type === 'rider'
                        ? 'Rider Distance & Payout'
                        : 'Business Owner Sales & Payout'}{' '}
                    Report
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Generated: {new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-extrabold text-sm">
                    {type === 'staff'
                      ? staffObj?.name
                      : type === 'rider'
                        ? riderRow?.rider.name || riderFallback?.name
                        : bizObj?.name}
                  </p>
                  <p className="font-mono-tabular text-slate-600">
                    {type === 'staff'
                      ? `ID: ${staffObj?.loginId || ''}`
                      : type === 'rider'
                        ? `ID: ${riderRow?.rider.loginId || riderFallback?.loginId || ''}`
                        : `ID: ${bizObj?.businessLoginId || 'N/A'}`}
                  </p>
                </div>
              </div>

              {type === 'staff' && staffObj && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-3">
                    <div className="space-y-1">
                      <p><strong>Role:</strong> {staffObj.role.toUpperCase()}</p>
                      <p><strong>City:</strong> {staffObj.city}</p>
                      <p><strong>Phone:</strong> {staffObj.phone}</p>
                      <p><strong>Email:</strong> {staffObj.email || 'N/A'}</p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p><strong>Payroll Month:</strong> {currentMonthLabel}</p>
                      <p><strong>Account Status:</strong> {staffObj.active ? 'ACTIVE' : 'SUSPENDED'}</p>
                      <p><strong>Salary Status:</strong> {(staffSalary?.status || 'pending').toUpperCase()}</p>
                      {staffSalary?.paidAt && (
                        <p>
                          <strong>Paid On:</strong>{' '}
                          {new Date(staffSalary.paidAt).toLocaleDateString('en-PK')}
                        </p>
                      )}
                    </div>
                  </div>
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b-2 border-slate-300">
                        <th className="py-2 text-left">Salary Component</th>
                        <th className="py-2 text-right">Amount (PKR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-200">
                        <td className="py-2">Monthly Base Salary</td>
                        <td className="py-2 text-right font-mono-tabular">
                          {formatPkr(staffSalary?.baseSalaryPkr ?? staffObj.monthlySalaryPkr)}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-2">Performance Bonus</td>
                        <td className="py-2 text-right font-mono-tabular">
                          +{formatPkr(staffSalary?.bonusPkr ?? 0)}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-2">Deductions</td>
                        <td className="py-2 text-right font-mono-tabular">
                          -{formatPkr(staffSalary?.deductionPkr ?? 0)}
                        </td>
                      </tr>
                      <tr className="border-t-2 border-slate-900 font-extrabold text-sm">
                        <td className="py-2.5">Net Payable Salary</td>
                        <td className="py-2.5 text-right font-mono-tabular">
                          {formatPkr(staffSalary?.netAmountPkr ?? staffObj.monthlySalaryPkr)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {type === 'rider' && (riderRow || riderFallback) && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-3">
                    <div className="space-y-1">
                      <p><strong>Period:</strong> {riderPeriodLabel}</p>
                      <p><strong>City:</strong> {(riderRow?.rider || riderFallback)?.city}</p>
                      <p><strong>Phone:</strong> {(riderRow?.rider || riderFallback)?.phone}</p>
                      <p><strong>Vehicle:</strong> {(riderRow?.rider || riderFallback)?.vehicleType} ({(riderRow?.rider || riderFallback)?.vehiclePlate})</p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p><strong>Delivered Trips:</strong> {riderRow?.tripsCount ?? 0}</p>
                      <p className="font-mono-tabular">
                        <strong>Total Distance:</strong> {(riderRow?.totalDistanceKm ?? 0).toFixed(1)} km (Avg {(riderRow?.avgDistanceKm ?? 0).toFixed(1)} km/order)
                      </p>
                      <p className="font-mono-tabular">
                        <strong>Delivery Pay + Tips:</strong> {formatPkr((riderRow?.deliveryPayPkr ?? 0) + (riderRow?.tipsPkr ?? 0))}
                      </p>
                      <p className="font-mono-tabular font-bold text-sm">
                        <strong>Total Payable:</strong> {formatPkr(riderRow?.netPayableToRiderPkr ?? riderSalary?.netAmountPkr ?? 0)}
                      </p>
                    </div>
                  </div>
                  {riderRow && riderRow.trips.length > 0 && (
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="border-b-2 border-slate-300">
                          <th className="py-1.5 text-left">Order</th>
                          <th className="py-1.5 text-left">Pickup → Drop-off</th>
                          <th className="py-1.5 text-right">Distance (km)</th>
                          <th className="py-1.5 text-right">Rider Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {riderRow.trips.map((t) => (
                          <tr key={t.id} className="border-b border-slate-200">
                            <td className="py-1.5 font-mono-tabular font-bold">{t.orderCode}</td>
                            <td className="py-1.5">{t.restaurantName} → {t.dropoffArea}</td>
                            <td className="py-1.5 text-right font-mono-tabular font-bold">{t.distanceKm.toFixed(1)} km</td>
                            <td className="py-1.5 text-right font-mono-tabular">{formatPkr(t.deliveryFeePkr + t.tipPkr)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="flex justify-between font-extrabold pt-2 border-t-2 border-slate-900">
                    <span>COD Cash Collected: {formatPkr(riderRow?.codCashPkr ?? 0)}</span>
                    <span>Status: {(riderRow?.status || riderSalary?.status || 'pending').toUpperCase()}</span>
                  </div>
                </div>
              )}

              {type === 'business' && bizObj && bizPayoutRow && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-3">
                    <div className="space-y-1">
                      <p><strong>Period:</strong> {activeBizPeriodLabel}</p>
                      <p><strong>City:</strong> {bizObj.city}</p>
                      <p><strong>Address:</strong> {bizObj.address}</p>
                      <p className="font-mono-tabular"><strong>Store GPS:</strong> {bizObj.lat.toFixed(5)}, {bizObj.lng.toFixed(5)}</p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p><strong>Delivered Orders:</strong> {bizPayoutRow.orderCount}</p>
                      <p className="font-mono-tabular"><strong>Gross Sales:</strong> {formatPkr(bizPayoutRow.record.grossSubtotalPkr)}</p>
                      <p className="font-mono-tabular"><strong>Fee / Deduction:</strong> {formatPkr(bizPayoutRow.record.commissionPkr)}</p>
                      <p className="font-mono-tabular font-bold text-sm">
                        <strong>Net Payable:</strong> {formatPkr(bizPayoutRow.record.netPayablePkr)}
                      </p>
                      <p className="font-mono-tabular font-bold">
                        <strong>Amount Paid:</strong>{' '}
                        {formatPkr(
                          bizPayoutRow.record.status === 'paid'
                            ? bizPayoutRow.record.netPayablePkr
                            : 0
                        )}{' '}
                        ({bizPayoutRow.record.status.toUpperCase()} · {bizPayoutRow.record.payoutMethod}
                        {bizPayoutRow.record.paymentRef ? ` · Ref ${bizPayoutRow.record.paymentRef}` : ''})
                      </p>
                    </div>
                  </div>
                  {bizPayoutRow.deliveredOrders.length > 0 && (
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="border-b-2 border-slate-300">
                          <th className="py-1.5 text-left">Order</th>
                          <th className="py-1.5 text-left">Customer</th>
                          <th className="py-1.5 text-left">Method</th>
                          <th className="py-1.5 text-right">Order Payable</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bizPayoutRow.deliveredOrders.map((ord) => (
                          <tr key={ord.id} className="border-b border-slate-200">
                            <td className="py-1.5 font-mono-tabular font-bold">{ord.orderCode}</td>
                            <td className="py-1.5">{ord.customerName}</td>
                            <td className="py-1.5">{ord.paymentMethod}</td>
                            <td className="py-1.5 text-right font-mono-tabular">
                              {formatPkr(ord.subtotalPkr || ord.totalPkr)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              <div className="border-t border-dashed border-slate-300 pt-3 text-center text-[11px] text-slate-500">
                HSP delivery — Official Individual Report · Confidential
              </div>
            </div>
          );
        })()}

      {/* Zoomed Photo Preview Modal for WhatsApp Order Attachments */}
      {waPhotoPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 no-print"
          onClick={() => setWaPhotoPreview(null)}
        >
          <div
            className="relative max-w-lg w-full bg-zinc-950 border border-amber-500/40 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setWaPhotoPreview(null)}
              className="absolute top-3 right-3 p-2 rounded-xl bg-black/80 text-white hover:text-yellow-400"
              aria-label="Close photo preview"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={waPhotoPreview}
              alt="WhatsApp order attached item"
              className="w-full max-h-[75vh] object-contain bg-black"
            />
          </div>
        </div>
      )}
      {/* Admin-only Delivery Photo Proof Verification Modal */}
      {isOwner && activeProofOrder && (
        <DeliveryProofModal
          order={activeProofOrder}
          proof={activeProofRecord || deliveryProofs?.[activeProofOrder.id] || null}
          loading={loadingProof}
          error={proofLoadError}
          onClose={() => {
            setActiveProofOrder(null);
            setActiveProofRecord(null);
            setProofLoadError(null);
          }}
          onRetry={() => openDeliveryProofModal(activeProofOrder)}
        />
      )}
    </div>
  );
}
