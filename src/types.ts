export type AppTab = 'order' | 'track' | 'restaurant' | 'rider' | 'dashboard';
export type UserRoleMode = 'customer' | 'rider' | 'business' | 'staff' | 'admin';
export type Language = 'en' | 'ur';
export type BusinessApprovalStatus = 'pending' | 'approved' | 'rejected';

export type PaymentMethod = 'COD' | 'JAZZCASH' | 'EASYPAISA' | 'CARD';
export type PaymentStatus = 'pending_cod' | 'paid' | 'refunded';

export type OrderStatus =
  | 'placed'
  | 'confirmed'
  | 'preparing'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface CityConfig {
  id: string;
  name: string;
  urduName: string;
  center: LatLng;
  popularAreas: string[];
  comingSoon?: boolean;
}

export type BusinessType = string;

export interface Restaurant {
  id: string;
  name: string;
  urduName?: string;
  businessType?: BusinessType;
  cuisine: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  coverImage: string;
  rating: number;
  reviewCount: number;
  deliveryTimeMin: number;
  deliveryFeePkr: number;
  minOrderPkr: number;
  isOpen: boolean;
  businessOpenTime?: string;
  businessCloseTime?: string;
  deliveryOpenTime?: string;
  deliveryCloseTime?: string;
  ownerId: string;
  ownerEmail?: string;
  ownerPhone?: string;
  businessLoginId?: string;
  approvalStatus?: BusinessApprovalStatus;
  isSeed?: boolean;
}

export interface MenuItemVariety {
  id: string;
  label: string;
  pricePkr: number;
}

export interface MenuItem {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  pricePkr: number;
  varieties?: MenuItemVariety[];
  category: string;
  imageUrl: string;
  available: boolean;
  ownerId: string;
  updatedAt?: string;
}

export interface RestaurantReview {
  id: string;
  restaurantId: string;
  authorId: string;
  customerName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  varietyLabel?: string;
  pricePkr: number;
  quantity: number;
  imageUrl?: string;
}

export interface Order {
  id: string;
  orderCode: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  restaurantId: string;
  restaurantName: string;
  restaurantOwnerId?: string;
  restaurantOwnerEmail?: string;
  restaurantLat: number;
  restaurantLng: number;
  city: string;
  items: OrderItem[];
  subtotalPkr: number;
  deliveryFeePkr: number;
  tipPkr?: number;
  riderEarningPkr?: number;
  totalPkr: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentRef?: string;
  status: OrderStatus;
  awaitingRiderDispatch?: boolean;
  acceptedByBusinessAt?: string;
  rejectedByBusinessAt?: string;
  rejectionReason?: string;
  cancelledBy?: 'customer' | 'business' | 'admin';
  cancelledAt?: string;
  cancellationReason?: string;
  riderAcceptedAt?: string;
  pickedUpAt?: string;
  deliveryAddress: string;
  deliveryNotes?: string;
  deliveryLat: number;
  deliveryLng: number;
  riderId?: string;
  riderName?: string;
  riderPhone?: string;
  riderEmail?: string;
  riderLat?: number;
  riderLng?: number;
  etaMinutes?: number;
  distanceKm?: number;
  driverRating?: number;
  driverReview?: string;
  driverTags?: string[];
  officeSettled?: boolean;
  officeSettledAt?: string;
  orderSource?: 'app' | 'whatsapp';
  whatsappItemPhoto?: string;
  whatsappItemNote?: string;
  whatsappOrderLink?: string;
  whatsappAmountAlreadyPaid?: boolean;
  whatsappAmountAlreadyPaidAt?: string;
  hasDeliveryProof?: boolean;
  deliveryProofCapturedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryProofRecord {
  orderId: string;
  orderCode: string;
  riderId: string;
  riderName: string;
  photoDataUrl: string;
  capturedAt: string;
}

export interface SupportMessage {
  id: string;
  userId: string;
  senderName: string;
  senderRole: 'customer' | 'support';
  orderCode?: string;
  text: string;
  createdAt: string;
}

export interface PushNotification {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  type: 'order' | 'status' | 'payment' | 'support';
  read: boolean;
}

export type RiderVehicleType = 'motorbike' | 'car' | 'bicycle';
export type RiderStatus = 'available' | 'on_delivery' | 'offline';

export interface Rider {
  id: string;
  name: string;
  email?: string;
  phone: string;
  cnic?: string;
  city: string;
  vehicleType: RiderVehicleType;
  vehiclePlate: string;
  loginId?: string;
  monthlySalaryPkr?: number;
  walletBonusPkr?: number;
  status: RiderStatus;
  rating: number;
  completedDeliveries: number;
  createdAt: string;
}

export interface StaffPermissions {
  canApproveBusinesses: boolean;
  canManageRiders: boolean;
  canEditRiderEarnings: boolean;
  canManageSalaries: boolean;
  canManageOrders: boolean;
  canViewAnalytics: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  role: 'manager' | 'staff';
  email?: string;
  phone: string;
  city: string;
  loginId: string;
  monthlySalaryPkr: number;
  permissions: StaffPermissions;
  active: boolean;
  createdAt: string;
}

export interface SalaryPayment {
  id: string;
  targetType: 'rider' | 'staff';
  targetId: string;
  targetName: string;
  roleLabel: string;
  monthKey: string;
  baseSalaryPkr: number;
  bonusPkr: number;
  deductionPkr: number;
  netAmountPkr: number;
  status: 'pending' | 'paid';
  paidAt?: string;
  createdAt: string;
}

export interface AccessPass {
  passId: string;
  roleType: 'rider' | 'business' | 'staff';
  targetId: string;
  label: string;
  emailHash?: string;
  active: boolean;
  permissions?: StaffPermissions;
}

export interface DeliveryRates {
  customerBaseKm: number;
  customerBaseFeePkr: number;
  customerExtraPerKmPkr: number;
  riderBaseKm: number;
  riderBasePayPkr: number;
  riderExtraPerKmPkr: number;
}

export interface CancellationPolicies {
  customerFreeCancelBeforeAccept: boolean;
  customerLateCancelFeePkr: number;
  customerRefundWindowHours: number;
  customerPolicyRules: string;
  businessResponseSlaMinutes: number;
  businessMaxMonthlyCancellations: number;
  businessCancelPenaltyPkr: number;
  businessPolicyRules: string;
}

export interface AppSettings {
  whatsappNumber: string;
  welcomeTitle?: string;
  welcomeSubtitle?: string;
  deletedBusinessIds?: string[];
  businessCategories?: string[];
  customerBaseKm?: number;
  customerBaseFeePkr?: number;
  customerExtraPerKmPkr?: number;
  riderBaseKm?: number;
  riderBasePayPkr?: number;
  riderExtraPerKmPkr?: number;
  customerFreeCancelBeforeAccept?: boolean;
  customerLateCancelFeePkr?: number;
  customerRefundWindowHours?: number;
  customerPolicyRules?: string;
  businessResponseSlaMinutes?: number;
  businessMaxMonthlyCancellations?: number;
  businessCancelPenaltyPkr?: number;
  businessPolicyRules?: string;
  playAndroidPackageName?: string;
  playSha256Fingerprint?: string;
  playDeveloperName?: string;
  playSupportEmail?: string;
  playProductionUrl?: string;
  updatedAt?: string;
}

export interface BusinessPayout {
  id: string;
  restaurantId: string;
  restaurantName: string;
  ownerId?: string;
  ownerEmail?: string;
  city: string;
  businessLoginId?: string;
  monthKey: string;
  grossSubtotalPkr: number;
  commissionPkr: number;
  netPayablePkr: number;
  payoutMethod: 'BANK' | 'JAZZCASH' | 'EASYPAISA' | 'CASH';
  paymentRef?: string;
  status: 'pending' | 'paid';
  paidAt?: string;
  updatedAt: string;
  createdAt: string;
}

export interface RiderEarningEntry {
  id: string;
  orderCode: string;
  riderId: string;
  restaurantName: string;
  dropoffArea: string;
  city: string;
  deliveryFeePkr: number;
  tipPkr: number;
  paymentMethod: PaymentMethod;
  completedAt: string;
  distanceKm?: number;
  source?: 'live' | 'history' | 'bonus';
}

