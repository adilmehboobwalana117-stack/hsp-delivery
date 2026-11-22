import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  BellRing,
  Bike,
  Calendar,
  CheckCircle2,
  ChefHat,
  Clock,
  Download,
  Edit3,
  FileText,
  ImagePlus,
  KeyRound,
  LocateFixed,
  MapPin,
  Phone,
  Plus,
  Printer,
  Save,
  Search,
  ShieldAlert,
  Store,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  BusinessPayout,
  BusinessType,
  CancellationPolicies,
  LatLng,
  MenuItem,
  MenuItemVariety,
  Order,
  OrderStatus,
  Restaurant,
} from '../types';
import {
  BUSINESS_TYPES,
  FOOD_IMAGES,
  PAKISTAN_CITIES,
  PRODUCT_CATEGORIES_BY_TYPE,
  formatPkr,
} from '../data/pakistanData';
import { compressFoodImage, playOrderReceivedSound } from '../utils/sound';
import { downloadCsv, triggerPrintWithTitle } from '../utils/exportPrint';
import {
  BUSINESS_EMERGENCY_CANCEL_REASONS,
  resolveCancellationPolicies,
} from '../utils/policies';
import {
  formatTimeRange,
  getStoreScheduleStatus,
  isValidTimeHHMM,
} from '../utils/storeHours';
import { FoodImage } from './FoodImage';
import { PinPickerMap } from './DeliveryMap';

interface RestaurantPortalProps {
  restaurants: Restaurant[];
  menuItems: MenuItem[];
  orders: Order[];
  businessPayouts?: BusinessPayout[];
  businessCategories?: string[];
  cancellationPolicies?: CancellationPolicies;
  onOpenPolicy?: () => void;
  isAdmin: boolean;
  lockedBusinessId?: string | null;
  defaultOpenRegisterForm?: boolean;
  soundMuted: boolean;
  businessBellCountdown?: number | null;
  onToggleMute: () => void;
  onAcceptOrderByBusiness: (orderId: string) => Promise<void>;
  onRejectOrderByBusiness: (orderId: string, reason: string) => Promise<void>;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  onAddMenuItem: (item: Omit<MenuItem, 'id' | 'ownerId'>) => Promise<void>;
  onUpdateMenuItem: (itemId: string, updates: Partial<MenuItem>) => Promise<void>;
  onAddRestaurant: (
    rest: Omit<Restaurant, 'id' | 'ownerId' | 'rating' | 'reviewCount' | 'isOpen'>
  ) => Promise<void>;
  onUpdateBusinessDetails?: (
    restaurantId: string,
    updates: Partial<Restaurant>
  ) => Promise<void>;
}

const QUICK_REJECTION_REASONS = [
  'Item out of stock',
  'Kitchen / store is too busy right now',
  'Store closing soon',
  'Delivery address outside area',
];

const PRESET_GALLERY = [
  { label: 'Grocery Pack', url: FOOD_IMAGES.groceryMart },
  { label: 'Pharmacy Kit', url: FOOD_IMAGES.pharmacyCare },
  { label: 'Bakery & Mithai', url: FOOD_IMAGES.bakerySweets },
  { label: 'Electronics', url: FOOD_IMAGES.electronicsHub },
  { label: 'Chicken Karahi', url: FOOD_IMAGES.chickenKarahi },
  { label: 'Sindhi Biryani', url: FOOD_IMAGES.sindhiBiryani },
  { label: 'BBQ Platter', url: FOOD_IMAGES.seekhKebab },
  { label: 'Beef Nihari', url: FOOD_IMAGES.nihariNaan },
];

const DEFAULT_COVER_BY_TYPE: Record<BusinessType, string> = {
  Restaurant: FOOD_IMAGES.chickenKarahi,
  'Grocery & Superstore': FOOD_IMAGES.groceryMart,
  'Pharmacy & Medical': FOOD_IMAGES.pharmacyCare,
  'Bakery & Sweets': FOOD_IMAGES.bakerySweets,
  'Electronics & Mobile': FOOD_IMAGES.electronicsHub,
  'Fashion & Boutique': FOOD_IMAGES.bakerySweets,
  'General Store': FOOD_IMAGES.groceryMart,
};

interface VarietyDraftSlot {
  label: string;
  pricePkr: string;
}

const createEmptyVarietySlots = (existing?: MenuItemVariety[]): VarietyDraftSlot[] =>
  [0, 1, 2, 3].map((idx) => ({
    label: existing?.[idx]?.label || '',
    pricePkr: existing?.[idx]?.pricePkr ? String(existing[idx].pricePkr) : '',
  }));

const parseVarietySlots = (slots: VarietyDraftSlot[]): MenuItemVariety[] =>
  slots
    .map((s, idx) => ({
      id: `var-${idx + 1}`,
      label: s.label.trim().slice(0, 60),
      pricePkr: Math.round(Number(s.pricePkr) || 0),
    }))
    .filter((v) => v.label.length >= 1 && v.pricePkr > 0);

export function RestaurantPortal({
  restaurants,
  menuItems,
  orders,
  businessPayouts = [],
  businessCategories,
  cancellationPolicies,
  onOpenPolicy,
  isAdmin,
  lockedBusinessId,
  defaultOpenRegisterForm = false,
  soundMuted,
  businessBellCountdown = null,
  onToggleMute,
  onAcceptOrderByBusiness,
  onRejectOrderByBusiness,
  onUpdateOrderStatus,
  onAddMenuItem,
  onUpdateMenuItem,
  onAddRestaurant,
  onUpdateBusinessDetails,
}: RestaurantPortalProps) {
  const policy = resolveCancellationPolicies(cancellationPolicies);
  const availableCategories =
    businessCategories && businessCategories.length > 0 ? businessCategories : BUSINESS_TYPES;
  const accessibleBusinesses = lockedBusinessId
    ? restaurants.filter((r) => r.id === lockedBusinessId)
    : restaurants;

  const [selectedRestaurantId, setSelectedRestaurantId] = useState(
    lockedBusinessId || accessibleBusinesses[0]?.id || restaurants[0]?.id || ''
  );
  const [showNewRestaurantForm, setShowNewRestaurantForm] = useState(defaultOpenRegisterForm);
  const [agreedBusinessPolicy, setAgreedBusinessPolicy] = useState(true);
  const [printSlipOrder, setPrintSlipOrder] = useState<Order | null>(null);
  const [printDailyReport, setPrintDailyReport] = useState(false);
  const [reportMode, setReportMode] = useState<'daily' | 'monthly' | 'all'>('monthly');
  const [reportDate, setReportDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reportMonth, setReportMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [reportSearch, setReportSearch] = useState<string>('');
  const [reportDeliveredOnly, setReportDeliveredOnly] = useState<boolean>(true);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectionReasonText, setRejectionReasonText] = useState('');
  const [rejectionError, setRejectionError] = useState('');
  const [emergencyCancelOrderId, setEmergencyCancelOrderId] = useState<string | null>(null);
  const [emergencyReasonText, setEmergencyReasonText] = useState('');
  const [emergencyAckChecked, setEmergencyAckChecked] = useState(false);
  const [emergencyError, setEmergencyError] = useState('');
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);

  const currentMonthIso = new Date().toISOString().slice(0, 7);
  const monthlyBusinessCancellations = orders.filter((o) => {
    if (selectedRestaurantId && o.restaurantId !== selectedRestaurantId) return false;
    if (o.status !== 'cancelled') return false;
    const isBizCancel =
      o.cancelledBy === 'business' ||
      (o.cancelledBy !== 'customer' && o.cancelledBy !== 'admin' && Boolean(o.rejectedByBusinessAt));
    if (!isBizCancel) return false;
    return (o.cancelledAt || o.rejectedByBusinessAt || o.updatedAt || o.createdAt || '').slice(0, 7) === currentMonthIso;
  }).length;

  useEffect(() => {
    if (lockedBusinessId) {
      setSelectedRestaurantId(lockedBusinessId);
    }
  }, [lockedBusinessId]);

  useEffect(() => {
    if (defaultOpenRegisterForm) {
      setShowNewRestaurantForm(true);
    }
  }, [defaultOpenRegisterForm]);

  const selectedBusiness =
    restaurants.find((r) => r.id === selectedRestaurantId) || accessibleBusinesses[0];
  const selectedBusinessType: BusinessType = selectedBusiness?.businessType || 'Restaurant';
  const categoryOptions =
    PRODUCT_CATEGORIES_BY_TYPE[selectedBusinessType] ||
    PRODUCT_CATEGORIES_BY_TYPE['General Store'] || ['General', 'Featured', 'Daily Essentials'];

  // Add Product / Menu Item form
  const [dishName, setDishName] = useState('');
  const [dishDesc, setDishDesc] = useState('');
  const [dishPrice, setDishPrice] = useState('950');
  const [dishVarieties, setDishVarieties] = useState<VarietyDraftSlot[]>(() =>
    createEmptyVarietySlots()
  );
  const [dishCategory, setDishCategory] = useState(categoryOptions[0] || 'General');
  const [dishImage, setDishImage] = useState(FOOD_IMAGES.chickenKarahi);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [savingDish, setSavingDish] = useState(false);

  // Add New Business / Store form (Defaults to Hasilpur)
  const [restBusinessType, setRestBusinessType] = useState<BusinessType>('Grocery & Superstore');
  const [restName, setRestName] = useState('');
  const [restUrdu, setRestUrdu] = useState('');
  const [restCuisine, setRestCuisine] = useState('Groceries, Daily Essentials & Fresh Produce');
  const [restCity, setRestCity] = useState('Hasilpur');
  const [restAddress, setRestAddress] = useState('');
  const [restOwnerEmail, setRestOwnerEmail] = useState('');
  const [restOwnerPhone, setRestOwnerPhone] = useState('+92 300 ');
  const [restBizOpen, setRestBizOpen] = useState('09:00');
  const [restBizClose, setRestBizClose] = useState('23:00');
  const [restDelOpen, setRestDelOpen] = useState('10:00');
  const [restDelClose, setRestDelClose] = useState('22:30');
  const [restCoverImage, setRestCoverImage] = useState(FOOD_IMAGES.groceryMart);
  const [restLocation, setRestLocation] = useState<LatLng>(PAKISTAN_CITIES[0].center);
  const [restLocationPinned, setRestLocationPinned] = useState<boolean>(false);
  const [restLocationError, setRestLocationError] = useState<string>('');
  const [locatingStoreGps, setLocatingStoreGps] = useState<boolean>(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [savingRest, setSavingRest] = useState(false);
  const [togglingStockId, setTogglingStockId] = useState<string | null>(null);

  // Selected Business Opening & Closing Timings (Business & Delivery)
  const [schedBizOpen, setSchedBizOpen] = useState(selectedBusiness?.businessOpenTime || '09:00');
  const [schedBizClose, setSchedBizClose] = useState(selectedBusiness?.businessCloseTime || '23:00');
  const [schedDelOpen, setSchedDelOpen] = useState(selectedBusiness?.deliveryOpenTime || '10:00');
  const [schedDelClose, setSchedDelClose] = useState(selectedBusiness?.deliveryCloseTime || '22:30');
  const [schedIsOpen, setSchedIsOpen] = useState(selectedBusiness?.isOpen !== false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    if (!selectedBusiness) return;
    setSchedBizOpen(selectedBusiness.businessOpenTime || '09:00');
    setSchedBizClose(selectedBusiness.businessCloseTime || '23:00');
    setSchedDelOpen(selectedBusiness.deliveryOpenTime || '10:00');
    setSchedDelClose(selectedBusiness.deliveryCloseTime || '22:30');
    setSchedIsOpen(selectedBusiness.isOpen !== false);
  }, [
    selectedBusiness?.id,
    selectedBusiness?.businessOpenTime,
    selectedBusiness?.businessCloseTime,
    selectedBusiness?.deliveryOpenTime,
    selectedBusiness?.deliveryCloseTime,
    selectedBusiness?.isOpen,
  ]);

  // Edit Existing Product / Menu Item inline state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');
  const [editItemVarieties, setEditItemVarieties] = useState<VarietyDraftSlot[]>(() =>
    createEmptyVarietySlots()
  );
  const [editItemCategory, setEditItemCategory] = useState('');
  const [editItemDesc, setEditItemDesc] = useState('');
  const [editItemImage, setEditItemImage] = useState('');
  const [editItemAvailable, setEditItemAvailable] = useState(true);
  const [uploadingEditImg, setUploadingEditImg] = useState(false);
  const [savingEditItem, setSavingEditItem] = useState(false);

  const activeOrders = orders.filter((o) => {
    if (o.status === 'delivered' || o.status === 'cancelled') return false;
    if (lockedBusinessId && o.restaurantId !== lockedBusinessId) return false;
    return true;
  });

  const businessPeriodOrders = orders.filter((o) => {
    if (selectedRestaurantId && o.restaurantId !== selectedRestaurantId) return false;
    if (o.status === 'cancelled') return false;
    if (reportMode === 'daily' && reportDate) {
      if ((o.createdAt || '').slice(0, 10) !== reportDate) return false;
    } else if (reportMode === 'monthly' && reportMonth) {
      if ((o.createdAt || '').slice(0, 7) !== reportMonth) return false;
    }
    if (reportSearch.trim()) {
      const q = reportSearch.trim().toLowerCase();
      const hit =
        o.orderCode.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.paymentMethod.toLowerCase().includes(q) ||
        o.items.some((i) => i.name.toLowerCase().includes(q));
      if (!hit) return false;
    }
    return true;
  });

  const deliveredPeriodOrders = businessPeriodOrders.filter((o) => o.status === 'delivered');
  const businessReportOrders = reportDeliveredOnly ? deliveredPeriodOrders : businessPeriodOrders;

  const storePaidPayouts = businessPayouts
    .filter((p) => p.restaurantId === selectedRestaurantId && p.status === 'paid')
    .sort((a, b) =>
      (b.paidAt || b.updatedAt || '').localeCompare(a.paidAt || a.updatedAt || '')
    );

  const totalPaidByAdminPkr = storePaidPayouts.reduce(
    (sum, p) => sum + (p.netPayablePkr || 0),
    0
  );

  const matchedBusinessPayout = businessPayouts.find((p) => {
    if (p.restaurantId !== selectedRestaurantId) return false;
    if (reportMode === 'daily') {
      return p.id === `payday-${selectedRestaurantId}-${reportDate}` || p.monthKey === reportDate;
    }
    if (reportMode === 'monthly') {
      return p.id === `pay-${selectedRestaurantId}-${reportMonth}` || p.monthKey === reportMonth;
    }
    return p.restaurantId === selectedRestaurantId && p.status === 'paid';
  }) || businessPayouts.find((p) => {
    if (p.restaurantId !== selectedRestaurantId) return false;
    if (reportMode === 'all') return true;
    return false;
  });

  const reportPeriodLabel =
    reportMode === 'daily'
      ? `Date: ${reportDate}`
      : reportMode === 'monthly'
        ? `Month: ${reportMonth}`
        : 'All Recorded Dates';

  const deliveredSubtotal = deliveredPeriodOrders.reduce(
    (s, o) => s + (o.subtotalPkr || o.totalPkr),
    0
  );
  const periodPaidPkr =
    reportMode === 'all'
      ? totalPaidByAdminPkr
      : matchedBusinessPayout?.status === 'paid'
        ? matchedBusinessPayout.netPayablePkr
        : 0;
  const reportSummary = {
    count: deliveredPeriodOrders.length,
    inProgressCount: Math.max(0, businessPeriodOrders.length - deliveredPeriodOrders.length),
    subtotalPkr: deliveredSubtotal,
    onlinePkr: deliveredPeriodOrders
      .filter((o) => o.paymentMethod !== 'COD')
      .reduce((s, o) => s + (o.subtotalPkr || o.totalPkr), 0),
    codPkr: deliveredPeriodOrders
      .filter((o) => o.paymentMethod === 'COD')
      .reduce((s, o) => s + (o.subtotalPkr || o.totalPkr), 0),
    commissionPkr: matchedBusinessPayout?.commissionPkr ?? 0,
    netPayablePkr: Math.max(0, deliveredSubtotal - (matchedBusinessPayout?.commissionPkr ?? 0)),
    amountPaidPkr: periodPaidPkr,
    totalPaidAllTimePkr: totalPaidByAdminPkr,
    payoutStatus:
      reportMode === 'all'
        ? totalPaidByAdminPkr > 0
          ? 'paid'
          : 'pending'
        : matchedBusinessPayout?.status || 'pending',
    payoutMethod: matchedBusinessPayout?.payoutMethod || 'BANK',
    paymentRef: matchedBusinessPayout?.paymentRef || '',
    paidAt: matchedBusinessPayout?.paidAt || '',
  };

  const selectedMenu = menuItems.filter((m) => m.restaurantId === selectedRestaurantId);

  const handlePrintSlip = (order: Order) => {
    setPrintDailyReport(false);
    setPrintSlipOrder(order);
    const cleanup = () => {
      setPrintSlipOrder(null);
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(() => {
      triggerPrintWithTitle(`HSP-Order-Slip-${order.orderCode}`);
    }, 60);
  };

  const handlePrintBusinessDailyReport = () => {
    setPrintSlipOrder(null);
    setPrintDailyReport(true);
    const cleanup = () => {
      setPrintDailyReport(false);
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(() => {
      const periodKey =
        reportMode === 'daily' ? reportDate : reportMode === 'monthly' ? reportMonth : 'All-Dates';
      triggerPrintWithTitle(
        `HSP-${reportMode}-Report-${(selectedBusiness?.name || 'Business').replace(/\s+/g, '-')}-${periodKey}`
      );
    }, 60);
  };

  const handleDownloadBusinessReportCsv = () => {
    const periodKey =
      reportMode === 'daily' ? reportDate : reportMode === 'monthly' ? reportMonth : 'all';
    downloadCsv(
      `hsp-business-${reportMode}-report-${periodKey}.csv`,
      [
        'Order Code',
        'Date',
        'Store',
        'Customer',
        'Items',
        'Payment Method',
        'Order Sale Payable (PKR)',
        'Delivery Fee (PKR)',
        'Customer Bill Total (PKR)',
        'Status',
      ],
      businessReportOrders.map((o) => [
        o.orderCode,
        o.createdAt,
        o.restaurantName,
        o.customerName,
        o.items.map((i) => `${i.quantity}x ${i.name}`).join(' | '),
        o.paymentMethod,
        o.subtotalPkr || o.totalPkr,
        o.deliveryFeePkr,
        o.totalPkr,
        o.status,
      ])
    );
  };

  const handleDownloadCatalogCsv = () => {
    if (!selectedBusiness) return;
    downloadCsv(
      `hsp-catalog-${selectedBusiness.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`,
      [
        'Store',
        'City',
        'Category',
        'Product Name',
        'Base Price (PKR)',
        'Varieties (up to 4)',
        'Available',
        'Description',
      ],
      selectedMenu.map((item) => [
        selectedBusiness.name,
        selectedBusiness.city,
        item.category,
        item.name,
        item.pricePkr,
        (item.varieties || []).map((v) => `${v.label}: Rs.${v.pricePkr}`).join(' | '),
        item.available ? 'Yes' : 'No',
        item.description,
      ])
    );
  };

  const handleBusinessSelectChange = (nextId: string) => {
    setSelectedRestaurantId(nextId);
    const found = restaurants.find((r) => r.id === nextId);
    const bType: BusinessType = found?.businessType || 'Restaurant';
    const nextCats =
      PRODUCT_CATEGORIES_BY_TYPE[bType] ||
      PRODUCT_CATEGORIES_BY_TYPE['General Store'] || ['General'];
    if (nextCats?.length) {
      setDishCategory(nextCats[0]);
    }
    setDishImage(DEFAULT_COVER_BY_TYPE[bType] || FOOD_IMAGES.groceryMart);
  };

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const compressed = await compressFoodImage(file, 640);
      setDishImage(compressed);
    } finally {
      setUploadingImg(false);
    }
  };

  const handleCoverImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const compressed = await compressFoodImage(file, 640);
      setRestCoverImage(compressed);
    } finally {
      setUploadingCover(false);
    }
  };

  const handleCreateDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRestaurantId || !dishName.trim()) return;
    const parsedVarieties = parseVarietySlots(dishVarieties);
    const basePrice = Math.max(
      10,
      Math.round(Number(dishPrice) || parsedVarieties[0]?.pricePkr || 500)
    );
    setSavingDish(true);
    try {
      await onAddMenuItem({
        restaurantId: selectedRestaurantId,
        name: dishName.trim(),
        description: dishDesc.trim() || 'Fresh stock ready for fast local delivery.',
        pricePkr: basePrice,
        ...(parsedVarieties.length > 0 ? { varieties: parsedVarieties } : {}),
        category: dishCategory,
        imageUrl: dishImage,
        available: true,
      });
      setDishName('');
      setDishDesc('');
      setDishPrice('950');
      setDishVarieties(createEmptyVarietySlots());
    } finally {
      setSavingDish(false);
    }
  };

  const startEditingItem = (item: MenuItem) => {
    setEditingItemId(item.id);
    setEditItemName(item.name);
    setEditItemPrice(String(item.pricePkr));
    setEditItemVarieties(createEmptyVarietySlots(item.varieties));
    setEditItemCategory(item.category);
    setEditItemDesc(item.description);
    setEditItemImage(item.imageUrl);
    setEditItemAvailable(item.available);
  };

  const handleEditItemImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingEditImg(true);
    try {
      const compressed = await compressFoodImage(file, 640);
      setEditItemImage(compressed);
    } finally {
      setUploadingEditImg(false);
    }
  };

  const handleSaveEditedItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItemId || !editItemName.trim()) return;
    const parsedVarieties = parseVarietySlots(editItemVarieties);
    const basePrice = Math.max(
      10,
      Math.round(Number(editItemPrice) || parsedVarieties[0]?.pricePkr || 100)
    );
    setSavingEditItem(true);
    try {
      await onUpdateMenuItem(editingItemId, {
        name: editItemName.trim(),
        pricePkr: basePrice,
        varieties: parsedVarieties,
        category: editItemCategory.trim() || 'General Items',
        description: editItemDesc.trim() || 'Fresh stock ready for fast local delivery.',
        imageUrl: editItemImage,
        available: editItemAvailable,
      });
      setEditingItemId(null);
    } finally {
      setSavingEditItem(false);
    }
  };

  const handleLocateStoreGps = () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setRestLocationError('GPS is unavailable on this browser. Please tap your store spot on the map.');
      return;
    }
    setLocatingStoreGps(true);
    setRestLocationError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRestLocation({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setRestLocationPinned(true);
        setLocatingStoreGps(false);
      },
      () => {
        setLocatingStoreGps(false);
        setRestLocationError('Could not detect GPS automatically. Tap or drag the pin on the map to attach your store location.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleCreateRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restName.trim() || !restAddress.trim()) return;
    if (!restLocationPinned) {
      setRestLocationError('Please attach your exact store GPS location on the map before submitting registration.');
      return;
    }
    const cityObj = PAKISTAN_CITIES.find((c) => c.name === restCity) || PAKISTAN_CITIES[0];
    setSavingRest(true);
    setRestLocationError('');
    try {
      const cleanedPhone = restOwnerPhone.trim();
      const cleanedEmail = restOwnerEmail.trim().toLowerCase();
      await onAddRestaurant({
        name: restName.trim(),
        urduName: restUrdu.trim() || undefined,
        businessType: restBusinessType,
        cuisine: restCuisine.trim() || restBusinessType,
        city: cityObj.name,
        address: restAddress.trim(),
        ...(cleanedEmail.includes('@') ? { ownerEmail: cleanedEmail } : {}),
        ...(cleanedPhone.length > 6 ? { ownerPhone: cleanedPhone } : {}),
        lat: Number(restLocation.lat.toFixed(6)),
        lng: Number(restLocation.lng.toFixed(6)),
        coverImage: restCoverImage,
        deliveryTimeMin: 25,
        deliveryFeePkr: 80,
        minOrderPkr: 300,
        ...(isValidTimeHHMM(restBizOpen) ? { businessOpenTime: restBizOpen } : {}),
        ...(isValidTimeHHMM(restBizClose) ? { businessCloseTime: restBizClose } : {}),
        ...(isValidTimeHHMM(restDelOpen) ? { deliveryOpenTime: restDelOpen } : {}),
        ...(isValidTimeHHMM(restDelClose) ? { deliveryCloseTime: restDelClose } : {}),
      });
      setRestName('');
      setRestUrdu('');
      setRestAddress('');
      setRestOwnerEmail('');
      setRestOwnerPhone('+92 300 ');
      setRestBizOpen('09:00');
      setRestBizClose('23:00');
      setRestDelOpen('10:00');
      setRestDelClose('22:30');
      setRestLocation(cityObj.center);
      setRestLocationPinned(false);
      setRestLocationError('');
      setShowNewRestaurantForm(false);
    } finally {
      setSavingRest(false);
    }
  };

  const handleSaveBusinessSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusiness || !onUpdateBusinessDetails) return;
    setSavingSchedule(true);
    try {
      await onUpdateBusinessDetails(selectedBusiness.id, {
        isOpen: schedIsOpen,
        ...(isValidTimeHHMM(schedBizOpen) ? { businessOpenTime: schedBizOpen } : {}),
        ...(isValidTimeHHMM(schedBizClose) ? { businessCloseTime: schedBizClose } : {}),
        ...(isValidTimeHHMM(schedDelOpen) ? { deliveryOpenTime: schedDelOpen } : {}),
        ...(isValidTimeHHMM(schedDelClose) ? { deliveryCloseTime: schedDelClose } : {}),
      });
    } finally {
      setSavingSchedule(false);
    }
  };

  return (
    <div className="space-y-8 pb-24">
      <div className={printSlipOrder || printDailyReport ? 'no-print space-y-8' : 'space-y-8'}>
        {/* Header Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0E0E14] border border-amber-500/30 rounded-2xl p-5 sm:p-6 shadow-xl no-print">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-yellow-400">
                Hasilpur &amp; Pakistan Multi-Business Partner Hub
              </p>
              {selectedBusiness?.businessLoginId && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 font-mono-tabular text-[10px] font-extrabold text-amber-300">
                  <KeyRound className="w-3 h-3" />
                  ID: {selectedBusiness.businessLoginId}
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
              Business &amp; Store Owner Portal
            </h1>
            <p className="text-sm font-semibold text-zinc-400 mt-1">
              Register any store or restaurant (subject to App Owner approval &amp; Login ID), upload products in WebP, and manage live orders.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {onOpenPolicy && (
              <button
                type="button"
                onClick={onOpenPolicy}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[42px] rounded-xl bg-amber-500/12 border border-amber-500/40 text-xs font-extrabold text-yellow-300 hover:bg-amber-500/20 transition-colors"
              >
                <FileText className="w-4 h-4 text-yellow-400" />
                Business Policy
              </button>
            )}
            <button
              type="button"
              onClick={() => playOrderReceivedSound(false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[42px] rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-amber-400 hover:text-yellow-300 transition-colors"
            >
              <Volume2 className="w-4 h-4 text-yellow-400" />
              Test Order Sound
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[42px] rounded-xl text-xs font-bold border transition-colors ${
                soundMuted
                  ? 'bg-zinc-900 text-zinc-400 border-zinc-700'
                  : 'bg-amber-500/15 text-yellow-300 border-amber-500/35'
              }`}
            >
              {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              {soundMuted ? 'Sound Muted' : 'Order Alert Sound On'}
            </button>
            <button
              type="button"
              onClick={() => setShowNewRestaurantForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[42px] rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 transition-all shadow-lg shadow-amber-500/20"
            >
              <Store className="w-4 h-4" />
              {showNewRestaurantForm ? 'Close Form' : 'Add Business / Store'}
            </button>
          </div>
        </div>

        {/* Business Owner Cancellation & Rejection Policy Compliance Strip */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0E0E14] border border-amber-500/25 shadow-lg space-y-3 no-print">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-yellow-400 shrink-0" />
              <h2 className="text-xs sm:text-sm font-extrabold text-white">
                Business Owner Order Cancellation &amp; Rejection Policy
              </h2>
            </div>
            {onOpenPolicy && (
              <button
                type="button"
                onClick={onOpenPolicy}
                className="text-xs font-extrabold text-yellow-400 hover:text-yellow-300 underline underline-offset-2"
              >
                Read Full Partner Policy
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2">
              <span className="text-zinc-400 font-semibold">Response SLA</span>
              <span className="font-mono-tabular font-extrabold text-yellow-300">
                Within {policy.businessResponseSlaMinutes} min
              </span>
            </div>
            <div className="px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2">
              <span className="text-zinc-400 font-semibold">This Month Cancellations</span>
              <span
                className={`font-mono-tabular font-extrabold ${
                  monthlyBusinessCancellations > policy.businessMaxMonthlyCancellations
                    ? 'text-rose-400'
                    : monthlyBusinessCancellations >= policy.businessMaxMonthlyCancellations
                      ? 'text-amber-300'
                      : 'text-emerald-400'
                }`}
              >
                {monthlyBusinessCancellations} / {policy.businessMaxMonthlyCancellations}
              </span>
            </div>
            <div className="px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2">
              <span className="text-zinc-400 font-semibold">Post-Accept Penalty</span>
              <span className="font-mono-tabular font-extrabold text-rose-300">
                {policy.businessCancelPenaltyPkr > 0
                  ? `${formatPkr(policy.businessCancelPenaltyPkr)} / order`
                  : 'Admin Warning'}
              </span>
            </div>
          </div>
        </div>

        {/* Selected Business Approval Banner */}
        {selectedBusiness?.approvalStatus === 'pending' && (
          <div className="p-4 rounded-2xl bg-amber-950/70 border border-amber-500/40 text-amber-200 flex items-center gap-3 text-xs sm:text-sm font-semibold no-print">
            <Clock className="w-5 h-5 text-yellow-400 shrink-0" />
            <div>
              <strong className="text-yellow-300">{selectedBusiness.name}</strong> is pending{' '}
              <strong>App Owner permission</strong>. Once approved, the App Owner will grant your Business Login ID and customers will see your store live.
            </div>
          </div>
        )}
        {selectedBusiness?.approvalStatus === 'rejected' && (
          <div className="p-4 rounded-2xl bg-rose-950/70 border border-rose-500/40 text-rose-200 flex items-center gap-3 text-xs sm:text-sm font-semibold no-print">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              Registration for <strong>{selectedBusiness.name}</strong> was not approved by the App Owner. Please contact HSP delivery support or submit updated details.
            </div>
          </div>
        )}

        {/* Add New Business / Store Form */}
        {showNewRestaurantForm && (
          <form
            onSubmit={handleCreateRestaurant}
            className="p-6 bg-[#0E0E14] border border-amber-500/35 rounded-2xl space-y-4 shadow-xl no-print"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-extrabold text-white">
                Register New Business or Store in {restCity}
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold border ${
                  isAdmin
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                    : 'bg-amber-500/15 text-yellow-300 border-amber-500/35'
                }`}
              >
                {isAdmin ? 'App Owner · Instant Approval' : 'Requires App Owner Permission & Login ID'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                  Business Category
                </label>
                <select
                  value={restBusinessType}
                  onChange={(e) => {
                    const nextType = e.target.value as BusinessType;
                    setRestBusinessType(nextType);
                    setRestCoverImage(DEFAULT_COVER_BY_TYPE[nextType]);
                    setRestCuisine(
                      nextType === 'Restaurant'
                        ? 'Desi Karahi, BBQ & Fast Food'
                        : nextType === 'Grocery & Superstore'
                          ? 'Groceries, Rice, Oil & Fresh Produce'
                          : nextType === 'Pharmacy & Medical'
                            ? 'Medicines, First Aid & Wellness'
                            : nextType === 'Bakery & Sweets'
                              ? 'Cakes, Mithai & Fresh Pastries'
                              : nextType === 'Electronics & Mobile'
                                ? 'Phones, Chargers, Audio & Tech'
                                : nextType === 'Fashion & Boutique'
                                  ? 'Clothing, Footwear & Accessories'
                                  : 'Daily Essentials & General Goods'
                    );
                  }}
                  className="w-full px-3.5 py-2.5 text-sm font-bold bg-zinc-900 text-yellow-300 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                >
                  {availableCategories.map((bt) => (
                    <option key={bt} value={bt}>
                      {bt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                  Business / Store Name
                </label>
                <input
                  type="text"
                  required
                  value={restName}
                  onChange={(e) => setRestName(e.target.value)}
                  placeholder="e.g., Hasilpur Mega Mart"
                  className="w-full px-3.5 py-2.5 text-sm font-semibold bg-zinc-900 text-white placeholder:text-zinc-500 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                  Urdu Name (Optional)
                </label>
                <input
                  type="text"
                  value={restUrdu}
                  onChange={(e) => setRestUrdu(e.target.value)}
                  placeholder="حاصل پور میگا مارٹ"
                  className="w-full px-3.5 py-2.5 text-sm font-urdu font-bold bg-zinc-900 text-white placeholder:text-zinc-500 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">City</label>
                <select
                  value={restCity}
                  onChange={(e) => {
                    const nextCity = e.target.value;
                    setRestCity(nextCity);
                    const matched = PAKISTAN_CITIES.find((c) => c.name === nextCity);
                    if (matched) {
                      setRestLocation(matched.center);
                      setRestLocationPinned(false);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 text-sm font-bold bg-zinc-900 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                >
                  {PAKISTAN_CITIES.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}{c.comingSoon ? ' (Coming Soon)' : ' (Live)'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                  Specialty / Tags
                </label>
                <input
                  type="text"
                  required
                  value={restCuisine}
                  onChange={(e) => setRestCuisine(e.target.value)}
                  placeholder="e.g., Medicines & Baby Care"
                  className="w-full px-3.5 py-2.5 text-sm font-semibold bg-zinc-900 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
              <label className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-xs font-bold text-yellow-300 hover:bg-amber-500/25 cursor-pointer transition-colors">
                <ImagePlus className="w-4 h-4 text-yellow-400" />
                {uploadingCover ? 'Converting WebP...' : 'Upload Store Photo'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverImageFile}
                  className="hidden"
                />
              </label>
              <input
                type="email"
                required
                value={restOwnerEmail}
                onChange={(e) => setRestOwnerEmail(e.target.value)}
                placeholder="Business Owner Email ID"
                className="px-3.5 py-2.5 text-sm font-semibold bg-zinc-900 text-white placeholder:text-zinc-500 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
              />
              <input
                type="tel"
                value={restOwnerPhone}
                onChange={(e) => setRestOwnerPhone(e.target.value)}
                placeholder="Owner Phone / WhatsApp (+92 300 ...)"
                className="px-3.5 py-2.5 text-sm font-mono-tabular font-semibold bg-zinc-900 text-white placeholder:text-zinc-500 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
              />
              <input
                type="text"
                required
                value={restAddress}
                onChange={(e) => setRestAddress(e.target.value)}
                placeholder="Full street address (e.g., Main Baldia Road, Hasilpur)"
                className="px-3.5 py-2.5 text-sm font-semibold bg-zinc-900 text-white placeholder:text-zinc-500 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
              />
            </div>
            <div className="p-4 rounded-xl bg-zinc-900/90 border border-amber-500/30 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-extrabold text-yellow-300 flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    Business &amp; Delivery Opening / Closing Timings
                  </p>
                  <p className="text-[11px] font-medium text-zinc-400">
                    Set separate shop opening/closing times and delivery service hours so customers know when you are open.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRestDelOpen(restBizOpen);
                    setRestDelClose(restBizClose);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-amber-500/40 text-[11px] font-extrabold text-amber-300 hover:bg-amber-500 hover:text-zinc-950 transition-colors"
                >
                  Same Delivery Hours as Business
                </button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    Business Opening Time
                  </label>
                  <input
                    type="time"
                    value={restBizOpen}
                    onChange={(e) => setRestBizOpen(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono-tabular font-bold bg-zinc-950 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    Business Closing Time
                  </label>
                  <input
                    type="time"
                    value={restBizClose}
                    onChange={(e) => setRestBizClose(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono-tabular font-bold bg-zinc-950 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-300 mb-1">
                    Delivery Opening Time
                  </label>
                  <input
                    type="time"
                    value={restDelOpen}
                    onChange={(e) => setRestDelOpen(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono-tabular font-bold bg-zinc-950 text-yellow-300 rounded-xl border border-amber-500/40 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-300 mb-1">
                    Delivery Closing Time
                  </label>
                  <input
                    type="time"
                    value={restDelClose}
                    onChange={(e) => setRestDelClose(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono-tabular font-bold bg-zinc-950 text-yellow-300 rounded-xl border border-amber-500/40 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* Required Store GPS Location Attachment */}
            <div className="p-4 rounded-xl bg-zinc-900/90 border border-amber-500/35 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-extrabold text-yellow-300 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-yellow-400" />
                    Attach Store Live GPS Location (Required for Riders)
                  </p>
                  <p className="text-[11px] font-medium text-zinc-400">
                    Tap your exact shop location on the map or use your device GPS so riders can navigate straight to your store.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={locatingStoreGps}
                    onClick={handleLocateStoreGps}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-400/45 text-[11px] font-extrabold text-yellow-300 hover:bg-amber-500/25 inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <LocateFixed className="w-3.5 h-3.5" />
                    {locatingStoreGps ? 'Detecting GPS...' : 'Use My Store GPS'}
                  </button>
                  {!restLocationPinned && (
                    <button
                      type="button"
                      onClick={() => {
                        setRestLocationPinned(true);
                        setRestLocationError('');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-[11px] font-bold text-zinc-200 hover:border-emerald-400 hover:text-emerald-300"
                    >
                      Confirm Pin Here
                    </button>
                  )}
                </div>
              </div>

              <PinPickerMap
                center={
                  (PAKISTAN_CITIES.find((c) => c.name === restCity) || PAKISTAN_CITIES[0]).center
                }
                pinnedLocation={restLocation}
                onPinChange={(nextPin: LatLng) => {
                  setRestLocation(nextPin);
                  setRestLocationPinned(true);
                  setRestLocationError('');
                }}
              />

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-mono-tabular font-bold text-zinc-300">
                  Pinned GPS: {restLocation.lat.toFixed(5)}, {restLocation.lng.toFixed(5)}
                </span>
                {restLocationPinned ? (
                  <span className="inline-flex items-center gap-1 font-extrabold text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Store Location Attached
                  </span>
                ) : (
                  <span className="font-bold text-amber-300">
                    Required: Tap map or press Use My Store GPS to attach location
                  </span>
                )}
              </div>

              {restLocationError && (
                <p className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {restLocationError}
                </p>
              )}
            </div>

            {/* Business Owner Policy Agreement */}
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-amber-500/30 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-start gap-2.5 text-xs font-bold text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={agreedBusinessPolicy}
                    onChange={(e) => setAgreedBusinessPolicy(e.target.checked)}
                    className="accent-yellow-400 w-4 h-4 mt-0.5 shrink-0"
                  />
                  <span>
                    I agree to HSP delivery&apos;s Business Owner Order &amp; Cancellation Policy
                    (respond within {policy.businessResponseSlaMinutes} min, mandatory rejection
                    reason, max {policy.businessMaxMonthlyCancellations} cancellations/month
                    {policy.businessCancelPenaltyPkr > 0
                      ? `, ${formatPkr(policy.businessCancelPenaltyPkr)} penalty for unjustified post-acceptance cancellations`
                      : ''}
                    ).
                  </span>
                </label>
                {onOpenPolicy && (
                  <button
                    type="button"
                    onClick={onOpenPolicy}
                    className="text-[11px] font-extrabold text-yellow-400 hover:underline shrink-0"
                  >
                    Read Policy
                  </button>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingRest || !agreedBusinessPolicy}
                className="px-6 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-sm font-extrabold hover:brightness-105 disabled:opacity-50 transition-all shrink-0"
              >
                {savingRest ? 'Submitting...' : isAdmin ? 'Publish Business' : 'Submit for Owner Approval'}
              </button>
            </div>
            {!isAdmin && (
              <p className="text-xs font-semibold text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3.5 py-2">
                Note: New business registrations require App Owner approval &amp; Login ID assignment before going live.
              </p>
            )}
          </form>
        )}

        {/* Business & Delivery Opening / Closing Hours Manager for Selected Store */}
        {selectedBusiness && onUpdateBusinessDetails && (
          <form
            onSubmit={handleSaveBusinessSchedule}
            className="p-5 sm:p-6 bg-[#0E0E14] border border-amber-500/30 rounded-2xl space-y-4 shadow-xl no-print"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-yellow-400" />
                  Business &amp; Delivery Timings — {selectedBusiness.name}
                </h2>
                <p className="text-xs font-semibold text-zinc-400 mt-0.5">
                  Set opening and closing times for your shop and delivery service. Shown live to customers.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const status = getStoreScheduleStatus({
                    isOpen: schedIsOpen,
                    businessOpenTime: schedBizOpen,
                    businessCloseTime: schedBizClose,
                    deliveryOpenTime: schedDelOpen,
                    deliveryCloseTime: schedDelClose,
                  });
                  return (
                    <>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border ${
                          status.isBusinessOpenNow
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                            : 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                        }`}
                      >
                        Shop: {status.isBusinessOpenNow ? 'Open Now' : 'Closed'}
                        {status.businessRange ? ` · ${status.businessRange}` : ''}
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border ${
                          status.isDeliveryOpenNow
                            ? 'bg-amber-500/15 text-yellow-300 border-amber-500/35'
                            : 'bg-zinc-900 text-zinc-400 border-zinc-700'
                        }`}
                      >
                        Delivery: {status.isDeliveryOpenNow ? 'Active' : 'Closed'}
                        {status.deliveryRange ? ` · ${status.deliveryRange}` : ''}
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                  Business Opening Time
                </label>
                <input
                  type="time"
                  required
                  value={schedBizOpen}
                  onChange={(e) => setSchedBizOpen(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-900 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                  Business Closing Time
                </label>
                <input
                  type="time"
                  required
                  value={schedBizClose}
                  onChange={(e) => setSchedBizClose(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-900 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-amber-300 mb-1.5">
                  Delivery Opening Time
                </label>
                <input
                  type="time"
                  required
                  value={schedDelOpen}
                  onChange={(e) => setSchedDelOpen(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-900 text-yellow-300 rounded-xl border border-amber-500/40 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-amber-300 mb-1.5">
                  Delivery Closing Time
                </label>
                <input
                  type="time"
                  required
                  value={schedDelClose}
                  onChange={(e) => setSchedDelClose(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-900 text-yellow-300 rounded-xl border border-amber-500/40 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800">
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schedIsOpen}
                    onChange={(e) => setSchedIsOpen(e.target.checked)}
                    className="accent-yellow-400 w-4 h-4"
                  />
                  Accepting Orders (Uncheck to Temporarily Close Store)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setSchedDelOpen(schedBizOpen);
                    setSchedDelClose(schedBizClose);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-[11px] font-bold text-amber-300 hover:border-amber-400 transition-colors"
                >
                  Copy Business Hours to Delivery
                </button>
              </div>
              <div className="flex items-center gap-3">
                {formatTimeRange(schedBizOpen, schedBizClose) && (
                  <span className="hidden sm:inline text-xs font-mono-tabular font-semibold text-zinc-400">
                    Shop {formatTimeRange(schedBizOpen, schedBizClose)}
                  </span>
                )}
                <button
                  type="submit"
                  disabled={savingSchedule}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 min-h-[42px] rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 disabled:opacity-50 transition-all shadow-lg shadow-amber-500/20"
                >
                  <Save className="w-4 h-4" />
                  {savingSchedule ? 'Saving Timings...' : 'Save Business & Delivery Timings'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Split Layout: Incoming Store Queue + Product & Image Manager */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Incoming Orders Queue */}
          <section className="lg:col-span-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-yellow-400" />
                Incoming Orders ({activeOrders.length})
              </h2>
              {businessBellCountdown !== null && (
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-yellow-300 font-mono-tabular">
                  <BellRing className="w-3.5 h-3.5 text-yellow-400 animate-bounce" />
                  Bell in {businessBellCountdown}s
                </span>
              )}
            </div>

            {activeOrders.length === 0 ? (
              <div className="p-8 bg-[#0E0E14] border border-zinc-800 rounded-2xl text-center text-sm font-semibold text-zinc-400">
                No active store orders right now. New customer orders ring every 15s until you accept or reject.
              </div>
            ) : (
              <div className="space-y-3.5">
                {activeOrders.map((ord) => {
                  const isAwaitingResponse = ord.status === 'placed';
                  const isRejectFormOpen = rejectingOrderId === ord.id;
                  const isBusy = processingOrderId === ord.id;

                  return (
                    <div
                      key={ord.id}
                      className={`p-5 bg-[#0E0E14] rounded-2xl space-y-3 shadow-xl transition-colors border ${
                        isAwaitingResponse
                          ? 'border-yellow-400/70 shadow-amber-500/10'
                          : 'border-zinc-800 hover:border-amber-500/35'
                      }`}
                    >
                      {isAwaitingResponse && (
                        <div className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-between gap-2 text-xs">
                          <span className="font-extrabold text-yellow-300 flex items-center gap-1.5">
                            <BellRing className="w-3.5 h-3.5 text-yellow-400 animate-bounce" />
                            New Order · Ringing every 15s until response
                          </span>
                          {businessBellCountdown !== null && (
                            <span className="font-mono-tabular font-bold text-amber-200">
                              {businessBellCountdown}s
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate">
                          <span className="font-mono-tabular font-extrabold text-sm text-yellow-400">
                            {ord.orderCode}
                          </span>
                          <span className="mx-1.5 text-zinc-600">·</span>
                          <span className="text-xs font-bold text-zinc-300">{ord.restaurantName}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-extrabold text-amber-300 capitalize">
                            {ord.status.replace(/_/g, ' ')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handlePrintSlip(ord)}
                            title="Print order slip"
                            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-yellow-300 hover:border-amber-400 transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <ul className="text-xs font-semibold text-zinc-300 space-y-1.5 border-y border-zinc-800 py-2.5">
                        {ord.items.map((item, i) => (
                          <li key={i} className="flex justify-between gap-2">
                            <span>
                              {item.quantity}× {item.name}
                            </span>
                            <span className="font-mono-tabular font-bold text-white">
                              {formatPkr(item.pricePkr * item.quantity)}
                            </span>
                          </li>
                        ))}
                      </ul>

                      <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
                        <span>
                          {ord.customerName} · {ord.paymentMethod}
                        </span>
                        <span className="font-mono-tabular font-extrabold text-sm text-yellow-400">
                          {formatPkr(ord.totalPkr)}
                        </span>
                      </div>

                      {/* Step 3 / Step 4 Rider Dispatch Status inside Store Queue */}
                      {!isAwaitingResponse && (
                        ord.riderId && ord.riderName ? (
                          <div className="px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/35 flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <Bike className="w-4 h-4 text-emerald-400 shrink-0" />
                              <div className="min-w-0">
                                <p className="font-extrabold text-emerald-300 truncate">
                                  Rider Accepted: {ord.riderName}
                                </p>
                                {ord.riderPhone && (
                                  <p className="font-mono-tabular text-[11px] text-zinc-300">
                                    {ord.riderPhone}
                                  </p>
                                )}
                              </div>
                            </div>
                            {ord.riderPhone && (
                              <a
                                href={`tel:${ord.riderPhone.replace(/\s+/g, '')}`}
                                className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500 hover:text-zinc-950 transition-colors shrink-0"
                                aria-label="Call assigned rider"
                              >
                                <Phone className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        ) : (
                          <div className="px-3 py-2 rounded-xl bg-zinc-900 border border-amber-500/30 text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                            <BellRing className="w-3.5 h-3.5 shrink-0" />
                            Notifying all available riders every 15s until accepted...
                          </div>
                        )
                      )}

                      {/* Step 2: Mandatory Rejection Reason Panel (Presets + Custom Written Text) */}
                      {isAwaitingResponse && isRejectFormOpen && (
                        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/40 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-extrabold text-rose-300">
                              Select or Write Rejection Reason (Sent to Customer)
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingOrderId(null);
                                setRejectionReasonText('');
                                setRejectionError('');
                              }}
                              className="text-zinc-400 hover:text-white p-1"
                              aria-label="Cancel reject"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <p className="text-[11px] font-semibold text-amber-200 bg-zinc-950/80 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                            Partner Policy: Rejection counts toward your monthly allowance ({monthlyBusinessCancellations}/{policy.businessMaxMonthlyCancellations} used). Update stock offline if an item is unavailable.
                          </p>

                          <div className="flex flex-wrap gap-1.5">
                            {QUICK_REJECTION_REASONS.map((preset) => {
                              const selected = rejectionReasonText === preset;
                              return (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => {
                                    setRejectionReasonText(preset);
                                    setRejectionError('');
                                  }}
                                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                                    selected
                                      ? 'bg-rose-500 text-white border-rose-300'
                                      : 'bg-zinc-900 text-zinc-200 border-zinc-700 hover:border-rose-400'
                                  }`}
                                >
                                  {preset}
                                </button>
                              );
                            })}
                          </div>

                          <textarea
                            rows={2}
                            maxLength={280}
                            value={rejectionReasonText}
                            onChange={(e) => {
                              setRejectionReasonText(e.target.value);
                              setRejectionError('');
                            }}
                            placeholder="Write exact reason for customer (required)..."
                            className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-zinc-950 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-rose-400"
                          />

                          {rejectionError && (
                            <p className="text-[11px] font-bold text-rose-300">{rejectionError}</p>
                          )}

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                const clean = rejectionReasonText.trim();
                                if (clean.length < 3) {
                                  setRejectionError('Please select or write a reason (at least 3 characters).');
                                  return;
                                }
                                setProcessingOrderId(ord.id);
                                try {
                                  await onRejectOrderByBusiness(ord.id, clean);
                                  setRejectingOrderId(null);
                                  setRejectionReasonText('');
                                  setRejectionError('');
                                } finally {
                                  setProcessingOrderId(null);
                                }
                              }}
                              className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-extrabold disabled:opacity-50 transition-colors"
                            >
                              {isBusy ? 'Sending Reason...' : 'Confirm Reject & Send to Customer'}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        {isAwaitingResponse && !isRejectFormOpen && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                setProcessingOrderId(ord.id);
                                try {
                                  await onAcceptOrderByBusiness(ord.id);
                                } finally {
                                  setProcessingOrderId(null);
                                }
                              }}
                              className="flex-1 min-h-[44px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 disabled:opacity-50 transition-all"
                            >
                              {isBusy ? 'Accepting...' : 'Accept & Alert Riders'}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setRejectingOrderId(ord.id);
                                setRejectionReasonText('');
                                setRejectionError('');
                              }}
                              className="min-h-[44px] py-2.5 px-4 rounded-xl bg-rose-500/15 border border-rose-500/45 text-rose-300 text-xs font-extrabold hover:bg-rose-500 hover:text-white disabled:opacity-50 transition-colors"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {ord.status === 'confirmed' && (
                          <button
                            type="button"
                            onClick={() => onUpdateOrderStatus(ord.id, 'preparing')}
                            className="flex-1 min-h-[42px] py-2.5 px-3 rounded-xl bg-zinc-900 border border-amber-500/40 text-amber-300 text-xs font-extrabold hover:bg-amber-500/15 transition-colors"
                          >
                            Start Preparing
                          </button>
                        )}
                        {(ord.status === 'confirmed' || ord.status === 'preparing') && ord.riderId && (
                          <button
                            type="button"
                            onClick={() => onUpdateOrderStatus(ord.id, 'picked_up')}
                            className="flex-1 min-h-[42px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 inline-flex items-center justify-center gap-1.5 transition-all"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Hand Off to Rider (Picked Up)
                          </button>
                        )}
                        {(ord.status === 'confirmed' || ord.status === 'preparing') &&
                          emergencyCancelOrderId !== ord.id && (
                            <button
                              type="button"
                              onClick={() => {
                                setEmergencyCancelOrderId(ord.id);
                                setEmergencyReasonText(BUSINESS_EMERGENCY_CANCEL_REASONS[0]);
                                setEmergencyAckChecked(false);
                                setEmergencyError('');
                              }}
                              className="min-h-[42px] py-2 px-3 rounded-xl bg-zinc-900 border border-rose-500/35 text-rose-300 text-xs font-bold hover:bg-rose-500/15 transition-colors"
                            >
                              Emergency Cancel
                            </button>
                          )}
                      </div>

                      {/* Emergency Post-Acceptance Cancellation Panel (Strictly Before Pickup) */}
                      {(ord.status === 'confirmed' || ord.status === 'preparing') &&
                        emergencyCancelOrderId === ord.id && (
                          <div className="p-3.5 rounded-xl bg-rose-500/12 border border-rose-500/45 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-extrabold text-rose-300 flex items-center gap-1.5">
                                <ShieldAlert className="w-4 h-4 shrink-0" />
                                Emergency Post-Acceptance Cancel (Before Pickup Only)
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setEmergencyCancelOrderId(null);
                                  setEmergencyError('');
                                }}
                                className="text-zinc-400 hover:text-white p-1"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <p className="text-[11px] font-semibold text-amber-200 leading-relaxed">
                              Policy Warning: Cancelling an already-accepted order notifies the
                              customer &amp; rider immediately and may incur a partner penalty of{' '}
                              <span className="font-mono-tabular font-extrabold text-white">
                                {formatPkr(policy.businessCancelPenaltyPkr)}
                              </span>{' '}
                              under Business Owner Policy ({monthlyBusinessCancellations}/
                              {policy.businessMaxMonthlyCancellations} monthly allowance used).
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {BUSINESS_EMERGENCY_CANCEL_REASONS.map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => {
                                    setEmergencyReasonText(preset);
                                    setEmergencyError('');
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                                    emergencyReasonText === preset
                                      ? 'bg-rose-500 text-white border-rose-300'
                                      : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-rose-400'
                                  }`}
                                >
                                  {preset}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              maxLength={280}
                              value={emergencyReasonText}
                              onChange={(e) => {
                                setEmergencyReasonText(e.target.value);
                                setEmergencyError('');
                              }}
                              placeholder="Write emergency cancellation reason..."
                              className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-zinc-950 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-rose-400"
                            />
                            <label className="flex items-start gap-2 text-[11px] font-semibold text-zinc-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={emergencyAckChecked}
                                onChange={(e) => {
                                  setEmergencyAckChecked(e.target.checked);
                                  setEmergencyError('');
                                }}
                                className="accent-rose-500 w-3.5 h-3.5 mt-0.5 shrink-0"
                              />
                              <span>
                                I understand this post-acceptance cancellation is logged under
                                HSP&apos;s Business Owner Policy.
                              </span>
                            </label>
                            {emergencyError && (
                              <p className="text-[11px] font-bold text-rose-300">{emergencyError}</p>
                            )}
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                const clean = emergencyReasonText.trim();
                                if (clean.length < 3) {
                                  setEmergencyError('Please enter a valid cancellation reason.');
                                  return;
                                }
                                if (!emergencyAckChecked) {
                                  setEmergencyError('Please acknowledge the Business Owner Cancellation Policy.');
                                  return;
                                }
                                setProcessingOrderId(ord.id);
                                try {
                                  await onRejectOrderByBusiness(ord.id, clean);
                                  setEmergencyCancelOrderId(null);
                                  setEmergencyReasonText('');
                                  setEmergencyAckChecked(false);
                                } finally {
                                  setProcessingOrderId(null);
                                }
                              }}
                              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-extrabold disabled:opacity-50"
                            >
                              {isBusy ? 'Cancelling Order...' : 'Confirm Emergency Cancellation'}
                            </button>
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Product Catalog Builder & Image Uploader */}
          <section className="lg:col-span-7 space-y-5">
            <div className="p-6 bg-[#0E0E14] border border-zinc-800 rounded-2xl space-y-5 shadow-xl no-print">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-extrabold text-white">
                    Add Product / Item &amp; Upload Photo
                  </h2>
                  <p className="text-xs font-semibold text-zinc-400 mt-0.5">
                    Upload any product for {selectedBusiness?.name || 'your selected business'} ({selectedBusinessType})
                  </p>
                </div>
                {!lockedBusinessId ? (
                  <select
                    value={selectedRestaurantId}
                    onChange={(e) => handleBusinessSelectChange(e.target.value)}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl border border-amber-500/35 bg-zinc-900 text-yellow-300 focus:outline-none focus:border-amber-400"
                  >
                    {restaurants.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.businessType || 'Restaurant'} · {r.city}
                        {r.approvalStatus === 'pending'
                          ? ' · Pending Approval'
                          : r.approvalStatus === 'rejected'
                            ? ' · Rejected'
                            : ''}
                        )
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-xs font-extrabold text-yellow-300">
                    {selectedBusiness?.name}
                  </span>
                )}
              </div>

              <form onSubmit={handleCreateDish} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                      Product / Dish Name
                    </label>
                    <input
                      type="text"
                      required
                      value={dishName}
                      onChange={(e) => setDishName(e.target.value)}
                      placeholder="e.g., Super Basmati 5kg / Panadol Pack / Chocolate Cake"
                      className="w-full px-3.5 py-2.5 text-sm font-semibold bg-zinc-900 text-white placeholder:text-zinc-500 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                      Price (PKR)
                    </label>
                    <input
                      type="number"
                      required
                      min={50}
                      max={100000}
                      value={dishPrice}
                      onChange={(e) => setDishPrice(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm font-mono-tabular font-bold bg-zinc-900 text-yellow-300 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                      Product Category
                    </label>
                    <select
                      value={dishCategory}
                      onChange={(e) => setDishCategory(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm font-bold bg-zinc-900 text-white rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                    >
                      {categoryOptions.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="General Items">General Items</option>
                      <option value="Special Offers">Special Offers</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                      Product Description
                    </label>
                    <input
                      type="text"
                      value={dishDesc}
                      onChange={(e) => setDishDesc(e.target.value)}
                      placeholder="Weight, brand, pack size, flavor, or product specifications"
                      className="w-full px-3.5 py-2.5 text-sm font-semibold bg-zinc-900 text-white placeholder:text-zinc-500 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                {/* 4 Manual Product Varieties with Price (Optional) */}
                <div className="p-4 rounded-xl bg-zinc-900/90 border border-amber-500/30 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-extrabold text-yellow-300">
                        Product Varieties &amp; Sizes (Up to 4 Manual Options with Price)
                      </p>
                      <p className="text-[11px] font-medium text-zinc-400">
                        Optional: add up to 4 sizes/packs (e.g., Half / Full / 1 kg / 5 kg). Customers will see all varieties with prices and pick one for their cart.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {dishVarieties.map((slot, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-2 rounded-xl bg-zinc-950 border border-zinc-800"
                      >
                        <span className="text-[10px] font-mono-tabular font-extrabold text-amber-400 px-1.5 shrink-0">
                          #{idx + 1}
                        </span>
                        <input
                          type="text"
                          value={slot.label}
                          onChange={(e) =>
                            setDishVarieties((prev) =>
                              prev.map((v, i) => (i === idx ? { ...v, label: e.target.value } : v))
                            )
                          }
                          placeholder={`Variety ${idx + 1} (e.g., Small / 1 kg)`}
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-semibold bg-zinc-900 text-white placeholder:text-zinc-500 rounded-lg border border-zinc-700 focus:outline-none focus:border-amber-400"
                        />
                        <input
                          type="number"
                          min={10}
                          max={100000}
                          value={slot.pricePkr}
                          onChange={(e) =>
                            setDishVarieties((prev) =>
                              prev.map((v, i) =>
                                i === idx ? { ...v, pricePkr: e.target.value } : v
                              )
                            )
                          }
                          placeholder="Rs."
                          className="w-24 px-2.5 py-1.5 text-xs font-mono-tabular font-extrabold bg-zinc-900 text-yellow-300 placeholder:text-zinc-500 rounded-lg border border-amber-500/35 focus:outline-none focus:border-yellow-400"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* High-Quality Product Photo Upload / Studio Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center p-4 rounded-xl bg-zinc-900/90 border border-zinc-800">
                  <div className="sm:col-span-4 aspect-[4/3] rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800">
                    <FoodImage src={dishImage} alt={dishName || 'Product preview'} />
                  </div>
                  <div className="sm:col-span-8 space-y-3">
                    <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-xs font-bold text-yellow-300 hover:bg-amber-500/25 cursor-pointer transition-colors">
                      <ImagePlus className="w-4 h-4 text-yellow-400" />
                      {uploadingImg ? 'Converting to WebP...' : 'Upload Product Photo'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFile}
                        className="hidden"
                      />
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_GALLERY.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setDishImage(preset.url)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                            dishImage === preset.url
                              ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 border-yellow-300'
                              : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-amber-400'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingDish}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-sm font-extrabold hover:brightness-105 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  {savingDish ? 'Publishing Product...' : 'Publish Product to Store'}
                </button>
              </form>
            </div>

            {/* Current Business Product Catalog List */}
            <div className="bg-[#0E0E14] border border-zinc-800 rounded-2xl p-5 space-y-3 shadow-xl print-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-extrabold text-white">
                    Active Store Products ({selectedMenu.length})
                  </h3>
                  {selectedBusiness?.approvalStatus === 'pending' && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-[11px] font-bold text-amber-300">
                      Pending Approval
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 no-print">
                  <button
                    type="button"
                    onClick={handleDownloadCatalogCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-amber-400 hover:text-yellow-300 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Catalog CSV
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      triggerPrintWithTitle(
                        `HSP-Catalog-${selectedBusiness?.name.replace(/\s+/g, '-') || 'Store'}`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-amber-400 hover:text-yellow-300 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Catalog
                  </button>
                </div>
              </div>
              <div className="divide-y divide-zinc-800">
                {selectedMenu.map((item) => {
                  const isEditing = editingItemId === item.id;
                  return (
                    <div key={item.id} className="py-3.5 space-y-3">
                      <div className="flex items-center gap-3.5">
                        <div className="w-16 h-12 rounded-xl overflow-hidden shrink-0 bg-zinc-900 border border-zinc-800">
                          <FoodImage src={item.imageUrl} alt={item.name} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-white truncate">{item.name}</p>
                            {!item.available && (
                              <span className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/35 text-[10px] font-bold text-rose-300">
                                Out of Stock
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-semibold text-zinc-400 truncate">
                            {item.category} · {item.description}
                          </p>
                          {item.varieties && item.varieties.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.varieties.map((v) => (
                                <span
                                  key={v.id}
                                  className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-[10px] font-bold text-yellow-300 font-mono-tabular"
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
                          disabled={togglingStockId === item.id}
                          onClick={async () => {
                            setTogglingStockId(item.id);
                            try {
                              await onUpdateMenuItem(item.id, { available: !item.available });
                            } finally {
                              setTogglingStockId(null);
                            }
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold border transition-colors no-print shrink-0 ${
                            item.available
                              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-rose-500/15 hover:border-rose-500/35 hover:text-rose-300'
                              : 'bg-rose-500/15 border-rose-500/35 text-rose-300 hover:bg-emerald-500/15 hover:border-emerald-500/35 hover:text-emerald-300'
                          }`}
                          title="Toggle item availability for customers"
                        >
                          {togglingStockId === item.id
                            ? '...'
                            : item.available
                              ? 'In Stock'
                              : 'Out of Stock'}
                        </button>
                        <button
                          type="button"
                          onClick={() => (isEditing ? setEditingItemId(null) : startEditingItem(item))}
                          className="p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-amber-300 hover:border-yellow-400 no-print"
                          title="Edit product price & photo"
                        >
                          {isEditing ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                        </button>
                      </div>

                      {isEditing && (
                        <form
                          onSubmit={handleSaveEditedItem}
                          className="p-4 rounded-xl bg-zinc-900/90 border border-amber-500/35 space-y-3 no-print"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <input
                              type="text"
                              required
                              value={editItemName}
                              onChange={(e) => setEditItemName(e.target.value)}
                              placeholder="Product Name"
                              className="sm:col-span-2 px-3 py-2 text-xs font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700 focus:outline-none focus:border-amber-400"
                            />
                            <input
                              type="number"
                              required
                              min={10}
                              max={100000}
                              value={editItemPrice}
                              onChange={(e) => setEditItemPrice(e.target.value)}
                              placeholder="Base Price PKR"
                              className="px-3 py-2 text-xs font-mono-tabular font-extrabold bg-zinc-950 text-yellow-300 rounded-lg border border-amber-500/40 focus:outline-none focus:border-yellow-400"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <input
                              type="text"
                              value={editItemCategory}
                              onChange={(e) => setEditItemCategory(e.target.value)}
                              placeholder="Category"
                              className="px-3 py-2 text-xs font-bold bg-zinc-950 text-white rounded-lg border border-zinc-700 focus:outline-none focus:border-amber-400"
                            />
                            <input
                              type="text"
                              value={editItemDesc}
                              onChange={(e) => setEditItemDesc(e.target.value)}
                              placeholder="Description"
                              className="sm:col-span-2 px-3 py-2 text-xs font-semibold bg-zinc-950 text-white rounded-lg border border-zinc-700 focus:outline-none focus:border-amber-400"
                            />
                          </div>

                          <div className="p-3 rounded-lg bg-zinc-950/90 border border-zinc-800 space-y-2">
                            <p className="text-[11px] font-extrabold text-yellow-300">
                              4 Manual Variety Options &amp; Prices (Leave blank if none)
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {editItemVarieties.map((slot, idx) => (
                                <div key={idx} className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono-tabular text-amber-400 w-5">
                                    #{idx + 1}
                                  </span>
                                  <input
                                    type="text"
                                    value={slot.label}
                                    onChange={(e) =>
                                      setEditItemVarieties((prev) =>
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
                                      setEditItemVarieties((prev) =>
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
                              <FoodImage src={editItemImage} alt={editItemName} />
                            </div>
                            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/35 text-xs font-bold text-yellow-300 hover:bg-amber-500/25 cursor-pointer">
                              <ImagePlus className="w-3.5 h-3.5" />
                              {uploadingEditImg ? 'WebP...' : 'Change Photo'}
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleEditItemImageFile}
                                className="hidden"
                              />
                            </label>
                            <div className="flex flex-wrap gap-1 flex-1">
                              {PRESET_GALLERY.slice(0, 4).map((p) => (
                                <button
                                  key={p.label}
                                  type="button"
                                  onClick={() => setEditItemImage(p.url)}
                                  className={`px-2 py-1 rounded text-[10px] font-bold border ${
                                    editItemImage === p.url
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
                                checked={editItemAvailable}
                                onChange={(e) => setEditItemAvailable(e.target.checked)}
                                className="accent-yellow-400 w-4 h-4"
                              />
                              In Stock
                            </label>
                            <button
                              type="submit"
                              disabled={savingEditItem}
                              className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold inline-flex items-center gap-1.5"
                            >
                              <Save className="w-3.5 h-3.5" />
                              {savingEditItem ? 'Saving...' : 'Save Changes'}
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
        </div>

        {/* Business Sale Orders & Daily / Monthly Reports Section */}
        <section className="bg-[#0E0E14] border border-amber-500/30 rounded-2xl overflow-hidden shadow-xl no-print">
          <div className="p-5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-extrabold text-white">
                  {selectedBusiness?.name || 'Business'} — Sale Orders &amp; {reportMode === 'daily' ? 'Daily' : reportMode === 'monthly' ? 'Monthly' : 'All-Time'} Report ({reportSummary.count})
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase border ${
                    reportSummary.payoutStatus === 'paid'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                      : 'bg-amber-500/15 text-yellow-300 border-amber-500/35'
                  }`}
                >
                  Payout: {reportSummary.payoutStatus}
                </span>
              </div>
              <p className="text-xs font-semibold text-zinc-400 mt-0.5">
                Daily &amp; monthly report of delivered orders payable to business owner, with print receipts and CSV export.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadBusinessReportCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-amber-400 hover:text-yellow-300 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {reportMode === 'daily' ? 'Daily CSV' : reportMode === 'monthly' ? 'Monthly CSV' : 'Export CSV'}
              </button>
              <button
                type="button"
                onClick={handlePrintBusinessDailyReport}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 transition-all"
              >
                <Printer className="w-3.5 h-3.5" />
                Print {reportMode === 'daily' ? 'Daily' : reportMode === 'monthly' ? 'Monthly' : 'Full'} Report
              </button>
            </div>
          </div>

          <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-950 border border-zinc-800">
              {(
                [
                  { id: 'daily', label: 'Daily Report' },
                  { id: 'monthly', label: 'Monthly Report' },
                  { id: 'all', label: 'All Dates' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setReportMode(m.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                    reportMode === m.id
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950'
                      : 'text-zinc-300 hover:text-yellow-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-950 border border-zinc-800">
              <button
                type="button"
                onClick={() => setReportDeliveredOnly(true)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                  reportDeliveredOnly
                    ? 'bg-emerald-500 text-zinc-950'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Delivered Only ({reportSummary.count})
              </button>
              <button
                type="button"
                onClick={() => setReportDeliveredOnly(false)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                  !reportDeliveredOnly
                    ? 'bg-zinc-800 text-yellow-300'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                All Orders ({businessPeriodOrders.length})
              </button>
            </div>

            {reportMode === 'daily' && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="px-3 py-2 text-xs font-mono-tabular font-bold bg-zinc-950 text-white rounded-xl border border-zinc-700"
                />
              </div>
            )}

            {reportMode === 'monthly' && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                <input
                  type="month"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                  className="px-3 py-2 text-xs font-mono-tabular font-bold bg-zinc-950 text-white rounded-xl border border-zinc-700"
                />
              </div>
            )}

            <div className="relative flex-1 min-w-[210px]">
              <Search className="w-4 h-4 text-yellow-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={reportSearch}
                onChange={(e) => setReportSearch(e.target.value)}
                placeholder="Search order code, customer name, or item..."
                className="w-full pl-9 pr-3 py-2 text-xs font-semibold bg-zinc-950 text-white placeholder:text-zinc-500 rounded-xl border border-zinc-700 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-4 border-b border-zinc-800">
            <div className="p-3 rounded-xl bg-zinc-900/80 border border-emerald-500/30">
              <p className="text-[11px] font-bold text-zinc-400">Delivered Orders</p>
              <p className="text-lg font-extrabold font-mono-tabular text-emerald-400">
                {reportSummary.count}
              </p>
              {reportSummary.inProgressCount > 0 && (
                <p className="text-[10px] font-semibold text-zinc-500">
                  +{reportSummary.inProgressCount} in progress
                </p>
              )}
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/80 border border-amber-500/35">
              <p className="text-[11px] font-bold text-zinc-400">Delivered Payment Payable</p>
              <p className="text-lg font-extrabold font-mono-tabular text-yellow-400">
                {formatPkr(reportSummary.netPayablePkr)}
              </p>
              <p className="text-[10px] font-semibold text-zinc-500">
                Delivered {formatPkr(reportSummary.subtotalPkr)}
                {reportSummary.commissionPkr > 0 ? ` - Fee ${formatPkr(reportSummary.commissionPkr)}` : ''}
              </p>
            </div>
            <div
              className={`p-3 rounded-xl border col-span-2 lg:col-span-1 ${
                reportSummary.amountPaidPkr > 0
                  ? 'bg-emerald-500/12 border-emerald-400/50'
                  : 'bg-zinc-900/80 border-zinc-800'
              }`}
            >
              <p className="text-[11px] font-bold text-emerald-300 flex items-center gap-1">
                <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                Amount Paid by Admin
              </p>
              <p
                className={`text-lg font-extrabold font-mono-tabular ${
                  reportSummary.amountPaidPkr > 0 ? 'text-emerald-300' : 'text-zinc-300'
                }`}
              >
                {formatPkr(reportSummary.amountPaidPkr)}
              </p>
              <p className="text-[10px] font-semibold text-zinc-400 truncate">
                {reportSummary.amountPaidPkr > 0
                  ? `${reportSummary.payoutMethod}${reportSummary.paymentRef ? ` · Ref ${reportSummary.paymentRef}` : ''}${reportSummary.paidAt ? ` · ${new Date(reportSummary.paidAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}` : ''}`
                  : reportSummary.totalPaidAllTimePkr > 0
                    ? `Pending · Total Paid: ${formatPkr(reportSummary.totalPaidAllTimePkr)}`
                    : 'Awaiting Admin settlement'}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/80 border border-emerald-500/25">
              <p className="text-[11px] font-bold text-zinc-400">Online Delivered</p>
              <p className="text-lg font-extrabold font-mono-tabular text-emerald-400">
                {formatPkr(reportSummary.onlinePkr)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
              <p className="text-[11px] font-bold text-zinc-400">COD Delivered</p>
              <p className="text-lg font-extrabold font-mono-tabular text-amber-300">
                {formatPkr(reportSummary.codPkr)}
              </p>
            </div>
          </div>

          {/* Paid Settlements Received from HSP Admin */}
          {storePaidPayouts.length > 0 && (
            <div className="px-4 py-3 border-b border-zinc-800 bg-emerald-500/5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-extrabold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Admin Payments Received ({storePaidPayouts.length}{' '}
                  {storePaidPayouts.length === 1 ? 'settlement' : 'settlements'})
                </p>
                <span className="text-xs font-mono-tabular font-extrabold text-emerald-300">
                  Total Paid by Admin: {formatPkr(totalPaidByAdminPkr)}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {storePaidPayouts.slice(0, 6).map((pay) => (
                  <div
                    key={pay.id}
                    className="px-3 py-2 rounded-xl bg-zinc-950/90 border border-emerald-500/30 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-mono-tabular font-extrabold text-emerald-300">
                        Paid {formatPkr(pay.netPayablePkr)}
                      </p>
                      <p className="text-[10px] font-semibold text-zinc-400 truncate">
                        Period {pay.monthKey} · {pay.payoutMethod}
                        {pay.paymentRef ? ` · Ref ${pay.paymentRef}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono-tabular font-bold text-emerald-400 shrink-0">
                      {pay.paidAt
                        ? new Date(pay.paidAt).toLocaleDateString('en-PK', {
                            day: 'numeric',
                            month: 'short',
                          })
                        : 'PAID'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {businessReportOrders.length === 0 ? (
            <div className="p-8 text-center text-xs font-semibold text-zinc-400">
              No {reportDeliveredOnly ? 'delivered ' : ''}orders found for {reportPeriodLabel}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-900/70 border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
                    <th className="py-3 px-4 font-extrabold">Sale Order</th>
                    <th className="py-3 px-4 font-extrabold">Customer</th>
                    <th className="py-3 px-4 font-extrabold">Items Sold</th>
                    <th className="py-3 px-4 font-extrabold">Payment</th>
                    <th className="py-3 px-4 font-extrabold text-right">Order Payable</th>
                    <th className="py-3 px-4 font-extrabold">Status</th>
                    <th className="py-3 px-4 font-extrabold text-right">Print</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {businessReportOrders.map((ord) => (
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
                      </td>
                      <td className="py-3 px-4 max-w-[220px] truncate text-zinc-300">
                        {ord.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            ord.paymentMethod === 'COD'
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          {ord.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-extrabold text-yellow-300 whitespace-nowrap">
                        {formatPkr(ord.subtotalPkr || ord.totalPkr)}
                      </td>
                      <td className="py-3 px-4 capitalize font-bold text-amber-300 whitespace-nowrap">
                        {ord.status.replace(/_/g, ' ')}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handlePrintSlip(ord)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 hover:border-amber-400 hover:text-yellow-300 font-bold"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Print Order
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Print-Only Business Daily / Monthly Report */}
      {printDailyReport && (
        <div className="print-only p-6 border border-slate-300 rounded-xl space-y-4">
          <div className="border-b border-slate-300 pb-3 flex justify-between items-start">
            <div>
              <h2 className="text-xl font-extrabold">
                HSP delivery — Business {reportMode === 'daily' ? 'Daily' : reportMode === 'monthly' ? 'Monthly' : 'Sale Orders'} Report
              </h2>
              <p className="text-xs">
                Business: {selectedBusiness?.name || 'Store'} ({selectedBusiness?.city || 'Hasilpur'}) ·{' '}
                {reportPeriodLabel} · Payout Status: {reportSummary.payoutStatus.toUpperCase()}
              </p>
            </div>
            <div className="text-right text-xs">
              <p>Sale Orders: {reportSummary.count}</p>
              <p>Net Payable to Business: {formatPkr(reportSummary.netPayablePkr)}</p>
              <p className="font-bold">
                Amount Paid by Admin: {formatPkr(reportSummary.amountPaidPkr)}
              </p>
            </div>
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="py-1.5 text-left">Order Code</th>
                <th className="py-1.5 text-left">Customer</th>
                <th className="py-1.5 text-left">Items Sold</th>
                <th className="py-1.5 text-left">Method</th>
                <th className="py-1.5 text-left">Status</th>
                <th className="py-1.5 text-right">Order Payable</th>
              </tr>
            </thead>
            <tbody>
              {businessReportOrders.map((ord) => (
                <tr key={ord.id} className="border-b border-slate-200">
                  <td className="py-1.5 font-mono-tabular font-bold">{ord.orderCode}</td>
                  <td className="py-1.5">{ord.customerName}</td>
                  <td className="py-1.5">
                    {ord.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                  </td>
                  <td className="py-1.5">{ord.paymentMethod}</td>
                  <td className="py-1.5 capitalize">{ord.status.replace(/_/g, ' ')}</td>
                  <td className="py-1.5 text-right font-mono-tabular">
                    {formatPkr(ord.subtotalPkr || ord.totalPkr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-sm font-extrabold flex justify-between pt-2 border-t border-slate-300">
            <span>
              Online: {formatPkr(reportSummary.onlinePkr)} · COD: {formatPkr(reportSummary.codPkr)}
            </span>
            <span className="font-mono-tabular">
              Payable Total: {formatPkr(reportSummary.netPayablePkr)}
            </span>
          </div>
        </div>
      )}

      {/* Print-Only Order Dispatch Slip */}
      {printSlipOrder && (
        <div className="print-only p-6 border border-slate-300 rounded-xl space-y-4">
          <div className="border-b border-slate-300 pb-3">
            <h2 className="text-xl font-extrabold">HSP delivery — Business Order Slip</h2>
            <p className="text-xs">
              Order {printSlipOrder.orderCode} · {printSlipOrder.restaurantName} ({printSlipOrder.city})
            </p>
          </div>
          <div className="text-xs space-y-1">
            <p>
              <strong>Customer:</strong> {printSlipOrder.customerName}
            </p>
            <p>
              <strong>Delivery Address:</strong> {printSlipOrder.deliveryAddress}
            </p>
            {printSlipOrder.deliveryNotes && (
              <p>
                <strong>Notes:</strong> {printSlipOrder.deliveryNotes}
              </p>
            )}
            <p>
              <strong>Payment:</strong> {printSlipOrder.paymentMethod} · Status:{' '}
              {printSlipOrder.status.replace(/_/g, ' ').toUpperCase()}
            </p>
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="py-1.5 text-left">Qty &amp; Product</th>
                <th className="py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {printSlipOrder.items.map((it, idx) => (
                <tr key={idx} className="border-b border-slate-200">
                  <td className="py-1.5">
                    {it.quantity}× {it.name}
                  </td>
                  <td className="py-1.5 text-right font-mono-tabular">
                    {formatPkr(it.pricePkr * it.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-sm font-extrabold flex justify-between pt-2 border-t border-slate-300">
            <span>Order Total</span>
            <span className="font-mono-tabular">{formatPkr(printSlipOrder.totalPkr)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
