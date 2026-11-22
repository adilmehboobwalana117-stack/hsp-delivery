import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Flame,
  History,
  MapPin,
  MessageCircle,
  MessageSquare,
  Percent,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Truck,
  Zap,
} from 'lucide-react';
import {
  BusinessType,
  CityConfig,
  Language,
  MenuItem,
  MenuItemVariety,
  Order,
  OrderItem,
  Restaurant,
  DeliveryRates,
  RestaurantReview,
} from '../types';
import {
  BUSINESS_TYPES,
  HASILPUR_HERO_DEALS,
  PAKISTAN_CITIES,
  TRANSLATIONS,
  formatPkr,
} from '../data/pakistanData';
import { LoyaltyTierInfo } from '../utils/loyalty';
import { downloadOrderReceipt, triggerPrintWithTitle } from '../utils/exportPrint';
import { resolveDeliveryRates } from '../utils/pricing';
import { getStoreScheduleStatus } from '../utils/storeHours';
import { FoodImage } from './FoodImage';
import { LoyaltyBadge } from './LoyaltyBadge';

interface CustomerMarketplaceProps {
  language: Language;
  selectedCity: CityConfig;
  onSelectCity: (city: CityConfig) => void;
  restaurants: Restaurant[];
  menuItems: MenuItem[];
  reviews: RestaurantReview[];
  orders: Order[];
  cartItems: OrderItem[];
  cartRestaurantId: string | null;
  customerName: string;
  loyaltyTier: LoyaltyTierInfo;
  completedOrdersCount: number;
  searchQuery: string;
  showWhatsAppButton?: boolean;
  whatsappNumber?: string;
  welcomeTitle?: string;
  welcomeSubtitle?: string;
  deliveryRates?: DeliveryRates;
  businessCategories?: string[];
  onSearchQueryChange: (q: string) => void;
  onAddToCart: (restaurant: Restaurant, item: MenuItem, variety?: MenuItemVariety) => void;
  onOpenCheckout: () => void;
  onOpenRestaurantPortal: () => void;
  onSubmitReview: (restaurantId: string, rating: number, comment: string) => Promise<void>;
  onReorder: (order: Order) => void;
  onTrackOrder: (orderId: string) => void;
  onOpenWhatsAppOrder?: () => void;
}

export function CustomerMarketplace({
  language,
  selectedCity,
  onSelectCity,
  restaurants,
  menuItems,
  reviews,
  orders,
  cartItems,
  cartRestaurantId,
  customerName,
  loyaltyTier,
  completedOrdersCount,
  searchQuery,
  showWhatsAppButton = false,
  whatsappNumber = '+92 300 7741209',
  welcomeTitle = 'Welcome to HSP delivery',
  welcomeSubtitle = 'Hasilpur’s Live Express Delivery for Food, Grocery, Pharmacy & Local Stores — Other Cities Coming Soon.',
  deliveryRates,
  businessCategories,
  onSearchQueryChange,
  onAddToCart,
  onOpenCheckout,
  onOpenRestaurantPortal,
  onSubmitReview,
  onReorder,
  onTrackOrder,
  onOpenWhatsAppOrder,
}: CustomerMarketplaceProps) {
  const t = TRANSLATIONS[language];
  const rates = resolveDeliveryRates(deliveryRates);
  const activeBusinessCategories =
    businessCategories && businessCategories.length > 0 ? businessCategories : BUSINESS_TYPES;
  const [businessFilter, setBusinessFilter] = useState<'ALL' | BusinessType>('ALL');
  const [activeRestaurantId, setActiveRestaurantId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'delivered' | 'active'>('all');

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [selectedVarieties, setSelectedVarieties] = useState<Record<string, string>>({});

  const approvedRestaurants = useMemo(
    () => restaurants.filter((r) => !r.approvalStatus || r.approvalStatus === 'approved'),
    [restaurants]
  );

  const handlePrintHistoryOrder = (order: Order) => {
    setPrintOrder(order);
    const cleanup = () => {
      setPrintOrder(null);
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(() => {
      triggerPrintWithTitle(`HSP-delivery-Receipt-${order.orderCode}`);
    }, 60);
  };

  // City-Scoped Hero Deals Carousel (Strictly only selected city advertising)
  const cityHeroDeals = useMemo(
    () => HASILPUR_HERO_DEALS.filter((d) => d.city === selectedCity.name),
    [selectedCity.name]
  );
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);

  useEffect(() => {
    setCarouselIndex(0);
    setActiveRestaurantId(null);
  }, [selectedCity.name]);

  useEffect(() => {
    if (carouselPaused || activeRestaurantId || cityHeroDeals.length <= 1) return;
    const timer = window.setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % cityHeroDeals.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [carouselPaused, activeRestaurantId, cityHeroDeals.length]);

  const activeSlide = cityHeroDeals[carouselIndex] || cityHeroDeals[0] || null;

  const handleOrderCarouselDeal = () => {
    if (!activeSlide) return;
    const rest = approvedRestaurants.find(
      (r) => r.id === activeSlide.restaurantId && r.city === selectedCity.name
    );
    const dish = menuItems.find((m) => m.id === activeSlide.menuItemId);
    if (rest && dish) {
      onAddToCart(rest, dish);
      onOpenCheckout();
    } else if (rest) {
      setActiveRestaurantId(rest.id);
    }
  };

  const activeRestaurant = useMemo(
    () => approvedRestaurants.find((r) => r.id === activeRestaurantId) || null,
    [approvedRestaurants, activeRestaurantId]
  );

  const filteredRestaurants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return approvedRestaurants.filter((r) => {
      if (r.city !== selectedCity.name) return false;
      const bType = r.businessType || 'Restaurant';
      if (businessFilter !== 'ALL' && bType !== businessFilter) return false;
      if (!q) return true;
      const hasMatchingProduct = menuItems.some(
        (m) =>
          m.restaurantId === r.id &&
          (m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q))
      );
      return (
        r.name.toLowerCase().includes(q) ||
        bType.toLowerCase().includes(q) ||
        r.cuisine.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q) ||
        hasMatchingProduct
      );
    });
  }, [approvedRestaurants, menuItems, selectedCity.name, businessFilter, searchQuery]);

  const activeMenu = useMemo(
    () => menuItems.filter((m) => m.restaurantId === activeRestaurantId && m.available),
    [menuItems, activeRestaurantId]
  );

  const activeReviews = useMemo(
    () => reviews.filter((rev) => rev.restaurantId === activeRestaurantId),
    [reviews, activeRestaurantId]
  );

  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);
  const cartTotal = cartItems.reduce((sum, i) => sum + i.pricePkr * i.quantity, 0);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRestaurant || !reviewComment.trim()) return;
    setSubmittingReview(true);
    try {
      await onSubmitReview(activeRestaurant.id, reviewRating, reviewComment.trim());
      setReviewComment('');
      setReviewRating(5);
    } finally {
      setSubmittingReview(false);
    }
  };

  // Store / Restaurant Detail View (Products/Menu + Reviews)
  if (activeRestaurant) {
    return (
      <div className="space-y-8 pb-28 view-enter">
        {/* High-Visibility Back to Menu Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-[#0E0E14] border border-amber-500/45 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setActiveRestaurantId(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="btn-shimmer group inline-flex items-center gap-2.5 px-4 py-2.5 min-h-[46px] rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-400 text-zinc-950 text-sm font-extrabold shadow-md shadow-amber-500/25 hover:brightness-105"
          >
            <ArrowLeft className="w-4 h-4 stroke-[2.8] transition-transform duration-150 group-hover:-translate-x-1" />
            <span>Back to Menu</span>
            <span className="hidden sm:inline text-xs font-bold opacity-80">
              · {selectedCity.name} Shops
            </span>
          </button>
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-300 pr-1 min-w-0">
            <span className="text-zinc-500 hidden sm:inline">Viewing:</span>
            <span className="text-yellow-300 font-extrabold truncate max-w-[190px] sm:max-w-[260px]">
              {activeRestaurant.name}
            </span>
          </div>
        </div>

        {/* Store / Business Hero Banner */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 items-stretch bg-[#0E0E14] border border-amber-500/30 rounded-3xl overflow-hidden shadow-2xl">
          <div className="lg:col-span-5 h-60 lg:h-auto min-h-[240px] bg-zinc-900">
            <FoodImage
              src={activeRestaurant.coverImage}
              alt={activeRestaurant.name}
              className="w-full h-full object-cover"
              priority
            />
          </div>
          <div className="lg:col-span-7 p-7 sm:p-9 flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-amber-400">
                <span className="px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-yellow-300">
                  {activeRestaurant.businessType || 'Restaurant'}
                </span>
                <span>{activeRestaurant.cuisine}</span>
                <span aria-hidden="true" className="text-zinc-600">·</span>
                <span className="text-zinc-300">{activeRestaurant.city}</span>
                <span aria-hidden="true" className="text-zinc-600">·</span>
                <span className="text-emerald-400">Cash on Delivery</span>
              </div>
              <div className="flex flex-wrap items-baseline gap-3">
                <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                  {activeRestaurant.name}
                </h1>
                {activeRestaurant.urduName && (
                  <span className="font-urdu text-xl text-yellow-400">
                    {activeRestaurant.urduName}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-zinc-400 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-yellow-400 shrink-0" />
                {activeRestaurant.address}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-7 pt-5 border-t border-zinc-800 text-sm">
              <div className="flex items-center gap-1.5">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                <span className="font-mono-tabular font-bold text-white">
                  {activeRestaurant.rating.toFixed(1)}
                </span>
                <span className="text-zinc-400 font-semibold">
                  ({activeRestaurant.reviewCount + activeReviews.length} reviews)
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-zinc-300">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="font-mono-tabular">{activeRestaurant.deliveryTimeMin} mins</span>
              </div>
              <div className="text-zinc-400">
                Delivery from{' '}
                <span className="font-mono-tabular font-bold text-yellow-400">
                  Rs. {rates.customerBaseFeePkr}
                </span>{' '}
                <span className="text-xs text-zinc-500">
                  (≤ {rates.customerBaseKm} km · +Rs. {rates.customerExtraPerKmPkr}/km)
                </span>
              </div>
            </div>

            {(() => {
              const sched = getStoreScheduleStatus(activeRestaurant);
              if (!sched.businessRange && !sched.deliveryRange) return null;
              return (
                <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-zinc-800/80 text-xs">
                  {sched.businessRange && (
                    <div
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border font-bold ${
                        sched.isBusinessOpenNow
                          ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                          : 'bg-rose-500/10 border-rose-500/35 text-rose-300'
                      }`}
                    >
                      <Store className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Business Hours:{' '}
                        <span className="font-mono-tabular text-white">{sched.businessRange}</span>
                      </span>
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/40">
                        {sched.isBusinessOpenNow ? 'Open' : 'Closed'}
                      </span>
                    </div>
                  )}
                  {sched.deliveryRange && (
                    <div
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border font-bold ${
                        sched.isDeliveryOpenNow
                          ? 'bg-amber-500/10 border-amber-500/35 text-yellow-300'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                      }`}
                    >
                      <Truck className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Delivery Hours:{' '}
                        <span className="font-mono-tabular text-white">{sched.deliveryRange}</span>
                      </span>
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/40">
                        {sched.isDeliveryOpenNow ? 'Active' : 'Closed'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Store Products / Menu Items Grid */}
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-extrabold text-white tracking-tight">
              Store Products &amp; Menu
            </h2>
            <span className="text-xs text-amber-400 font-mono-tabular font-bold">
              {activeMenu.length} {activeMenu.length === 1 ? 'item' : 'items'} available
            </span>
          </div>

          {activeMenu.length === 0 ? (
            <div className="p-10 text-center bg-[#0E0E14] border border-zinc-800 rounded-2xl text-sm text-zinc-400">
              No products added yet for this business. Use the Business Portal tab to upload products and photos.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeMenu.map((item) => {
                const varieties = (item.varieties || []).filter(
                  (v) => v.label.trim() && v.pricePkr > 0
                );
                const hasVarieties = varieties.length > 0;
                const chosenVariety = hasVarieties
                  ? varieties.find((v) => v.id === selectedVarieties[item.id]) || varieties[0]
                  : undefined;

                const effectivePrice = chosenVariety ? chosenVariety.pricePkr : item.pricePkr;
                const targetCartId = chosenVariety ? `${item.id}::${chosenVariety.id}` : item.id;

                const activeVarQty =
                  cartRestaurantId === activeRestaurant.id
                    ? cartItems.find((c) => c.menuItemId === targetCartId)?.quantity || 0
                    : 0;
                const totalItemInCart =
                  cartRestaurantId === activeRestaurant.id
                    ? cartItems
                        .filter(
                          (c) => c.menuItemId === item.id || c.menuItemId.startsWith(`${item.id}::`)
                        )
                        .reduce((s, c) => s + c.quantity, 0)
                    : 0;

                return (
                  <div
                    key={item.id}
                    className="bg-[#0E0E14] border border-zinc-800 hover:border-amber-400/50 rounded-2xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 shadow-xl"
                  >
                    <div className="aspect-[4/3] bg-zinc-900 overflow-hidden relative">
                      <FoodImage src={item.imageUrl} alt={item.name} />
                      {hasVarieties && (
                        <span className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-amber-500/40 text-[10px] font-extrabold text-yellow-300">
                          {varieties.length} Varieties
                        </span>
                      )}
                    </div>
                    <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                      <div className="space-y-2.5">
                        <div>
                          <p className="text-xs font-bold text-amber-400">{item.category}</p>
                          <h3 className="text-base font-extrabold text-white">{item.name}</h3>
                          <p className="text-xs font-medium text-zinc-400 line-clamp-2 leading-relaxed mt-0.5">
                            {item.description}
                          </p>
                        </div>

                        {hasVarieties && (
                          <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                              Select Variety &amp; Price:
                            </p>
                            <div className="grid grid-cols-1 gap-1.5">
                              {varieties.map((v) => {
                                const isChosen = chosenVariety?.id === v.id;
                                const vQty =
                                  cartRestaurantId === activeRestaurant.id
                                    ? cartItems.find((c) => c.menuItemId === `${item.id}::${v.id}`)
                                        ?.quantity || 0
                                    : 0;
                                return (
                                  <div
                                    key={v.id}
                                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border text-xs transition-all ${
                                      isChosen
                                        ? 'bg-amber-500/15 border-amber-400 text-white'
                                        : 'bg-zinc-900/80 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSelectedVarieties((prev) => ({
                                          ...prev,
                                          [item.id]: v.id,
                                        }))
                                      }
                                      className="flex-1 flex items-center justify-between gap-2 text-left font-bold"
                                    >
                                      <span className="truncate">{v.label}</span>
                                      <span className="font-mono-tabular font-extrabold text-yellow-400 shrink-0">
                                        {formatPkr(v.pricePkr)}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedVarieties((prev) => ({
                                          ...prev,
                                          [item.id]: v.id,
                                        }));
                                        onAddToCart(activeRestaurant, item, v);
                                      }}
                                      title={`Add ${v.label} to cart`}
                                      className="px-2 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-[10px] font-extrabold hover:brightness-105 shrink-0 inline-flex items-center gap-0.5"
                                    >
                                      <Plus className="w-3 h-3 stroke-[3]" />
                                      {vQty > 0 ? vQty : 'Add'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-zinc-800 gap-2">
                        <div>
                          <span className="text-lg font-extrabold font-mono-tabular text-yellow-400">
                            {formatPkr(effectivePrice)}
                          </span>
                          {chosenVariety && (
                            <p className="text-[10px] font-bold text-amber-300 truncate max-w-[140px]">
                              {chosenVariety.label}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => onAddToCart(activeRestaurant, item, chosenVariety)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[42px] rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 active:scale-[0.98] transition-all shadow-sm shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
                          {activeVarQty > 0
                            ? `${t.addToCart} (${activeVarQty})`
                            : totalItemInCart > 0
                              ? `${t.addToCart} (${totalItemInCart} in cart)`
                              : t.addToCart}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Store Reviews & Feedback Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6 border-t border-zinc-800">
          <div className="lg:col-span-5 bg-[#0E0E14] border border-amber-500/25 rounded-2xl p-6 space-y-5 shadow-xl">
            <div className="flex items-center gap-2.5">
              <MessageSquare className="w-5 h-5 text-yellow-400" />
              <h3 className="text-lg font-extrabold text-white">Rate &amp; Review Store</h3>
            </div>
            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2">Your Rating</label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      className="p-1.5 rounded-lg hover:bg-zinc-900 transition-colors"
                      aria-label={`Rate ${star} stars`}
                    >
                      <Star
                        className={`w-6 h-6 ${
                          star <= reviewRating
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-zinc-600'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-sm font-mono-tabular font-bold text-yellow-400">
                    {reviewRating}.0 / 5.0
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                  Share your shopping &amp; delivery experience
                </label>
                <textarea
                  rows={3}
                  required
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="How was product quality, packaging, and delivery speed?"
                  className="w-full px-3.5 py-2.5 text-sm font-semibold rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
                />
              </div>
              <button
                type="submit"
                disabled={submittingReview}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-sm font-extrabold hover:brightness-105 disabled:opacity-50 transition-all"
              >
                {submittingReview ? 'Posting Review...' : 'Submit Review'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <h3 className="text-lg font-extrabold text-white">
              Customer Reviews ({activeReviews.length})
            </h3>
            {activeReviews.length === 0 ? (
              <div className="p-6 bg-[#0E0E14] border border-zinc-800 rounded-2xl text-sm text-zinc-400">
                Be the first to review {activeRestaurant.name}.
              </div>
            ) : (
              <div className="space-y-3">
                {activeReviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-5 bg-[#0E0E14] border border-zinc-800 rounded-2xl space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold text-white">{rev.customerName}</span>
                      <div className="flex items-center gap-1 text-xs font-mono-tabular text-yellow-400 font-bold">
                        <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                        {rev.rating.toFixed(1)}
                      </div>
                    </div>
                    <p className="text-sm font-medium text-zinc-300 leading-relaxed">
                      {rev.comment}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Bottom Quick Return to Main Menu */}
        <div className="pt-2 flex justify-center">
          <button
            type="button"
            onClick={() => {
              setActiveRestaurantId(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="group inline-flex items-center gap-2.5 px-6 py-3 min-h-[48px] rounded-2xl bg-[#0E0E14] border-2 border-amber-400/70 text-yellow-300 text-sm font-extrabold hover:bg-amber-500/15 shadow-lg"
          >
            <ArrowLeft className="w-4 h-4 stroke-[2.6] transition-transform duration-150 group-hover:-translate-x-1" />
            Back to All {selectedCity.name} Shops &amp; Menu
          </button>
        </div>

        {/* Floating Gold Cart Bar */}
        {cartCount > 0 && (
          <div className="fixed bottom-20 lg:bottom-6 left-4 right-4 lg:left-auto lg:right-8 lg:w-96 z-40">
            <button
              type="button"
              onClick={onOpenCheckout}
              className="btn-shimmer w-full px-5 py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-400 text-zinc-950 shadow-[0_12px_36px_rgba(250,204,21,0.35)] hover:brightness-105 flex items-center justify-between"
            >
              <span className="inline-flex items-center gap-2 text-sm font-extrabold">
                <ShoppingBag className="w-4 h-4 stroke-[2.5]" />
                View Cart ({cartCount})
              </span>
              <span className="font-mono-tabular font-extrabold text-sm">
                {formatPkr(cartTotal)}
              </span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Main Black & Gold Marketplace View (Strictly Selected City Advertising & Businesses)
  const isCityComingSoon = Boolean(selectedCity.comingSoon);
  const activeSavings = activeSlide
    ? Math.max(0, activeSlide.originalPricePkr - activeSlide.dealPricePkr)
    : 0;
  const hasilpurCity = PAKISTAN_CITIES.find((c) => c.id === 'Hasilpur') || PAKISTAN_CITIES[0];

  return (
    <div className="space-y-8 pb-28">
      <div className={printOrder ? 'no-print space-y-8' : 'space-y-8'}>
        {/* Crisp Black & Gold Welcome Banner */}
        <section className="rounded-2xl bg-gradient-to-r from-[#141004] via-[#1C1606] to-[#0E0E14] border border-amber-400/45 px-5 sm:px-7 py-5 shadow-[0_14px_40px_rgba(245,158,11,0.14)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-400 text-zinc-950 flex items-center justify-center shrink-0 shadow-md">
              <Sparkles className="w-5 h-5 stroke-[2.3]" />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-yellow-400">
                Assalam-o-Alaikum, {customerName}
              </p>
              <h2 className="text-lg sm:text-2xl font-display font-extrabold text-white tracking-tight">
                {welcomeTitle}
              </h2>
              <p className="text-xs sm:text-sm font-medium text-amber-100/80">
                {welcomeSubtitle}
              </p>
            </div>
          </div>
          <div className="text-xs font-mono-tabular font-extrabold text-yellow-300 bg-black/50 border border-amber-500/35 rounded-xl px-4 py-2.5 shrink-0">
            {isCityComingSoon
              ? `${selectedCity.name} · Coming Soon`
              : `${selectedCity.name} · Delivery from Rs. ${rates.customerBaseFeePkr}`}
          </div>
        </section>

        {/* Coming Soon Notice when a non-active city is selected */}
        {isCityComingSoon && (
          <section className="rounded-2xl bg-[#0E0E14] border border-amber-500/40 p-6 sm:p-8 text-center space-y-4 shadow-xl no-print">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-yellow-400">
              HSP delivery Expansion
            </p>
            <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-white">
              {selectedCity.name} — Coming Soon
            </h2>
            <p className="text-sm font-medium text-zinc-300 max-w-xl mx-auto">
              HSP delivery is currently live in <strong className="text-yellow-300">Hasilpur</strong>{' '}
              and launching soon in {selectedCity.name}. Switch to Hasilpur to explore live deals,
              local shops, and instant doorstep delivery.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => onSelectCity(hasilpurCity)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-sm font-extrabold hover:brightness-105 shadow-lg shadow-amber-500/20"
              >
                Switch to Hasilpur (Live Now)
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </section>
        )}

        {/* City-Wide Custom Order Advertising Banner (Shown only for live selected city) */}
        {!isCityComingSoon && (
        <section
          aria-label="Order anything in your city"
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#161105] via-[#12100B] to-[#0B0B10] border border-amber-400/50 p-5 sm:p-7 shadow-[0_18px_48px_rgba(245,158,11,0.16)] no-print"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2.5 max-w-2xl">
              <p className="text-xs font-extrabold tracking-wide text-yellow-400">
                HSP Delivery · City-Wide Custom Order Service · {selectedCity.name}
              </p>
              <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white tracking-tight leading-snug text-balance">
                Order Anything from Your City — Delivered to Your Desired Destination
              </h2>
              <p className="text-xs sm:text-sm font-medium text-zinc-300 leading-relaxed">
                Want to order anything from any shop, market, pharmacy, or store in{' '}
                <strong className="text-yellow-300">{selectedCity.name}</strong>? Simply pay for the{' '}
                <strong className="text-white">item price + delivery fee</strong> (Rs. {rates.customerBaseFeePkr} within {rates.customerBaseKm} km,
                +Rs. {rates.customerExtraPerKmPkr}/km) and get your order delivered straight to your desired destination.
              </p>
            </div>

            {showWhatsAppButton && (
              <div className="flex flex-col sm:items-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenWhatsAppOrder?.()}
                  className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 min-h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-zinc-950 text-sm font-extrabold shadow-[0_10px_28px_rgba(16,185,129,0.32)] transition-all whitespace-nowrap"
                >
                  <MessageCircle className="w-5 h-5 stroke-[2.5]" />
                  Order on WhatsApp
                </button>
                <span className="text-[11px] font-mono-tabular font-bold text-emerald-300/90">
                  Attach Photo · Pin Location · {whatsappNumber}
                </span>
              </div>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-amber-500/20 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-xs">
            <div className="space-y-0.5">
              <p className="font-extrabold text-yellow-300">01. Anything in Your City</p>
              <p className="text-zinc-400 font-medium">
                Food, groceries, medicines, market items, gifts, or local parcels from any shop.
              </p>
            </div>
            <div className="space-y-0.5 sm:border-l sm:border-zinc-800 sm:pl-6">
              <p className="font-extrabold text-yellow-300">02. Pay Item Price + Delivery Fee</p>
              <p className="text-zinc-400 font-medium">
                Pay only the actual shop receipt price plus fair distance delivery fee (from Rs. {rates.customerBaseFeePkr}).
              </p>
            </div>
            <div className="space-y-0.5 sm:border-l sm:border-zinc-800 sm:pl-6">
              <p className="font-extrabold text-yellow-300">03. Delivered to Your Destination</p>
              <p className="text-zinc-400 font-medium">
                Trusted HSP rider picks up and delivers directly to your home, office, or pinned spot.
              </p>
            </div>
          </div>
        </section>
        )}

        {/* Selected City Promotional Deals & Popular Dishes Hero Carousel */}
        {!isCityComingSoon && activeSlide && (
        <section
          onMouseEnter={() => setCarouselPaused(true)}
          onMouseLeave={() => setCarouselPaused(false)}
          className="grid grid-cols-1 lg:grid-cols-12 gap-0 items-stretch bg-[#0E0E14] border border-amber-500/30 rounded-3xl overflow-hidden shadow-2xl no-print"
        >
          <div className="lg:col-span-6 p-7 sm:p-10 flex flex-col justify-between gap-6">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-extrabold text-yellow-400 uppercase tracking-[0.14em] inline-flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-amber-400" />
                  {activeSlide.eyebrow}
                </p>
                <span className="text-xs font-mono-tabular font-bold text-zinc-400 shrink-0">
                  0{carouselIndex + 1} / 0{cityHeroDeals.length}
                </span>
              </div>

              <h1
                className={`text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.06] ${
                  language === 'ur' ? 'font-urdu leading-loose' : ''
                }`}
              >
                {activeSlide.title}
              </h1>

              <p className="text-sm sm:text-base font-medium text-zinc-300 leading-relaxed">
                {activeSlide.subtitle}
              </p>

              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-emerald-400 pt-1">
                <span>{activeSlide.restaurantName}</span>
                <span aria-hidden="true" className="text-zinc-600">
                  ·
                </span>
                <span className="text-amber-300">{activeSlide.area}</span>
              </div>
            </div>

            <div className="space-y-5">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-3xl sm:text-4xl font-extrabold font-mono-tabular bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-300 bg-clip-text text-transparent">
                  {formatPkr(activeSlide.dealPricePkr)}
                </span>
                <span className="text-sm font-mono-tabular font-bold text-zinc-500 line-through">
                  {formatPkr(activeSlide.originalPricePkr)}
                </span>
                <span className="text-xs font-bold text-emerald-400">
                  · Cash on Delivery Available
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleOrderCarouselDeal}
                  className="inline-flex items-center gap-2 px-6 py-3.5 min-h-[48px] rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-400 text-zinc-950 text-sm font-extrabold hover:brightness-105 active:scale-[0.98] transition-all shadow-lg shadow-amber-500/25"
                >
                  <ShoppingBag className="w-4 h-4 stroke-[2.5]" />
                  Order Deal Now
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRestaurantId(activeSlide.restaurantId)}
                  className="inline-flex items-center gap-1.5 px-4 py-3.5 min-h-[48px] rounded-xl bg-zinc-900 border border-amber-500/30 text-amber-200 text-xs font-bold hover:border-yellow-400 hover:text-yellow-300 transition-colors"
                >
                  View Store Menu
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Carousel Controls & Slide Indicators */}
              <div className="pt-4 border-t border-zinc-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-1">
                  {cityHeroDeals.map((slide, idx) => (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => setCarouselIndex(idx)}
                      aria-label={`Show deal ${idx + 1}: ${slide.title}`}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        idx === carouselIndex
                          ? 'w-10 bg-gradient-to-r from-amber-500 to-yellow-400'
                          : 'w-4 bg-zinc-700 hover:bg-zinc-600'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setCarouselIndex(
                        (prev) => (prev - 1 + cityHeroDeals.length) % cityHeroDeals.length
                      )
                    }
                    className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 hover:border-amber-400 hover:text-yellow-300 flex items-center justify-center transition-colors"
                    aria-label="Previous city deal"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCarouselIndex((prev) => (prev + 1) % cityHeroDeals.length)
                    }
                    className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 hover:border-amber-400 hover:text-yellow-300 flex items-center justify-center transition-colors"
                    aria-label="Next city deal"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 relative min-h-[280px] lg:min-h-[430px] bg-zinc-900 overflow-hidden">
            <FoodImage
              key={activeSlide.id}
              src={activeSlide.imageUrl}
              alt={activeSlide.title}
              priority
              className="w-full h-full object-cover transition-opacity duration-500"
            />
            {activeSavings > 0 && (
              <div className="absolute top-5 right-5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold font-mono-tabular shadow-xl border border-yellow-200/60">
                SAVE {formatPkr(activeSavings)}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-7 text-white">
              <p className="text-xs text-yellow-400 font-bold uppercase tracking-wider">
                Hasilpur Featured Stores · {selectedCity.popularAreas.slice(0, 3).join(' · ')}
              </p>
              <p className="text-sm font-semibold text-zinc-200 mt-1">
                Pin your current location on Google Maps for exact distance pricing — available riders in {selectedCity.name} receive instant dispatch alerts.
              </p>
            </div>
          </div>
        </section>
        )}

        {/* Selected City Black & Gold Campaign Cards */}
        {!isCityComingSoon && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => {
              onSearchQueryChange('BBQ');
            }}
            className="text-left p-5 rounded-2xl bg-[#0E0E14] border border-amber-500/30 hover:border-yellow-400 transition-all group shadow-lg"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-yellow-400">
                Smoky Grill Offer
              </span>
              <Flame className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
            </div>
            <h3 className="text-lg font-extrabold text-white mt-1.5">
              {selectedCity.name} BBQ Nights
            </h3>
            <p className="text-xs font-medium text-zinc-400 mt-1">
              Hot charcoal seekh kebabs &amp; malai boti platters with up to Rs. 250 off.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              onSearchQueryChange('');
              onSelectCity(hasilpurCity);
            }}
            className="text-left p-5 rounded-2xl bg-[#0E0E14] border border-amber-500/30 hover:border-yellow-400 transition-all group shadow-lg"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400">
                Distance-Based Fair Rate
              </span>
              <Zap className="w-4 h-4 text-yellow-400 group-hover:scale-110 transition-transform" />
            </div>
            <h3 className="text-lg font-extrabold text-white mt-1.5">
              Rs. {rates.customerBaseFeePkr} Delivery (≤ {rates.customerBaseKm} km)
            </h3>
            <p className="text-xs font-medium text-zinc-400 mt-1">
              Pin your GPS drop-off: Rs. {rates.customerBaseFeePkr} within {rates.customerBaseKm} km and just Rs. {rates.customerExtraPerKmPkr} per extra km.
            </p>
          </button>

          <button
            type="button"
            onClick={handleOrderCarouselDeal}
            className="text-left p-5 rounded-2xl bg-[#0E0E14] border border-amber-500/30 hover:border-yellow-400 transition-all group shadow-lg"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300">
                Digital Pay &amp; Tips
              </span>
              <Percent className="w-4 h-4 text-yellow-400 group-hover:scale-110 transition-transform" />
            </div>
            <h3 className="text-lg font-extrabold text-white mt-1.5">
              JazzCash, EasyPaisa &amp; COD
            </h3>
            <p className="text-xs font-medium text-zinc-400 mt-1">
              Pay digitally or cash at your gate and add optional rider tips directly in checkout.
            </p>
          </button>
        </section>
        )}

        {/* City Selector, Dish Search & Store Partner Bar */}
        <section className="p-5 sm:p-6 bg-[#0E0E14] border border-amber-500/25 rounded-2xl space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {PAKISTAN_CITIES.map((city) => {
                const isActive = selectedCity.id === city.id;
                const cityLabel = language === 'ur' ? city.urduName : city.name;
                return (
                  <button
                    key={city.id}
                    type="button"
                    onClick={() => onSelectCity(city)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap inline-flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 shadow-[0_4px_18px_rgba(250,204,21,0.28)]'
                        : city.comingSoon
                          ? 'bg-zinc-950 text-zinc-400 border border-zinc-800 hover:border-zinc-600 hover:text-zinc-200'
                          : 'bg-zinc-900 text-zinc-200 border border-zinc-800 hover:border-amber-400/50 hover:text-yellow-300'
                    }`}
                  >
                    <span>{cityLabel}</span>
                    {city.comingSoon && (
                      <span
                        className={`text-[10px] font-bold ${
                          isActive ? 'text-zinc-900' : 'text-amber-400/80'
                        }`}
                      >
                        · Coming Soon
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onOpenRestaurantPortal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/45 text-yellow-300 text-xs font-extrabold hover:bg-amber-500 hover:text-zinc-950 transition-all whitespace-nowrap"
            >
              <Store className="w-4 h-4" />
              Add Business &amp; Products
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Business Type Category Filter Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setBusinessFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
                businessFilter === 'ALL'
                  ? 'bg-yellow-400 text-zinc-950 shadow-sm'
                  : 'bg-zinc-900 text-zinc-300 border border-zinc-800 hover:border-amber-400/50 hover:text-yellow-300'
              }`}
            >
              All Businesses
            </button>
            {activeBusinessCategories.map((bType) => {
              const active = businessFilter === bType;
              return (
                <button
                  key={bType}
                  type="button"
                  onClick={() => setBusinessFilter(bType)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
                    active
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 shadow-sm'
                      : 'bg-zinc-900 text-zinc-300 border border-zinc-800 hover:border-amber-400/50 hover:text-yellow-300'
                  }`}
                >
                  {bType}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-yellow-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full pl-11 pr-4 py-3.5 text-sm font-bold rounded-xl border border-zinc-700 bg-zinc-950 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>
        </section>

        {/* Featured Local Businesses, Stores & Restaurants Grid (Selected City Only) */}
        <section className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Top Shops &amp; Restaurants in {selectedCity.name}
                {isCityComingSoon ? ' (Coming Soon)' : ''}
              </h2>
              <p className="text-sm font-semibold text-zinc-400 mt-1">
                {isCityComingSoon
                  ? `HSP delivery is launching soon in ${selectedCity.name}. Currently live in Hasilpur.`
                  : `Showing verified restaurants, grocery superstores, pharmacies, bakeries & local shops in ${selectedCity.name}.`}
              </p>
            </div>
            <span className="text-xs font-mono-tabular font-bold text-yellow-400">
              {filteredRestaurants.length} {filteredRestaurants.length === 1 ? 'store' : 'stores'} in {selectedCity.name}
            </span>
          </div>

          {filteredRestaurants.length === 0 ? (
            <div className="p-12 bg-[#0E0E14] border border-zinc-800 rounded-2xl text-center space-y-4">
              <p className="text-sm font-bold text-zinc-300">
                {isCityComingSoon
                  ? `${selectedCity.name} is Coming Soon! Explore live shops and fast delivery in Hasilpur today.`
                  : `No businesses matched your search in ${selectedCity.name}.`}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {isCityComingSoon ? (
                  <button
                    type="button"
                    onClick={() => {
                      onSearchQueryChange('');
                      setBusinessFilter('ALL');
                      onSelectCity(hasilpurCity);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105"
                  >
                    Switch to Hasilpur (Live Now)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onSearchQueryChange('');
                      setBusinessFilter('ALL');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold hover:border-amber-400"
                  >
                    Reset Filters in {selectedCity.name}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenRestaurantPortal}
                  className="px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-yellow-300 text-xs font-extrabold hover:bg-amber-500 hover:text-zinc-950 transition-colors"
                >
                  Register Your {selectedCity.name} Business
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
              {filteredRestaurants.map((rest) => {
                const sched = getStoreScheduleStatus(rest);
                return (
                  <button
                    key={rest.id}
                    type="button"
                    onClick={() => setActiveRestaurantId(rest.id)}
                    className="group text-left bg-[#0E0E14] border border-zinc-800 hover:border-amber-400/60 rounded-2xl overflow-hidden hover:-translate-y-1 transition-all duration-200 flex flex-col shadow-xl"
                  >
                    <div className="aspect-[4/3] w-full bg-zinc-900 overflow-hidden relative">
                      <FoodImage
                        src={rest.coverImage}
                        alt={rest.name}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/85 to-transparent" />
                      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-amber-500/35 text-[11px] font-bold text-yellow-300">
                        {rest.businessType || 'Restaurant'}
                      </span>
                      <span
                        className={`absolute top-3 right-3 px-2 py-0.5 rounded-lg backdrop-blur-md border text-[10px] font-extrabold ${
                          sched.isBusinessOpenNow
                            ? 'bg-emerald-950/85 border-emerald-500/45 text-emerald-300'
                            : 'bg-rose-950/85 border-rose-500/45 text-rose-300'
                        }`}
                      >
                        {sched.isBusinessOpenNow ? 'Open Now' : 'Closed'}
                      </span>
                    </div>
                    <div className="p-5 flex-1 flex flex-col justify-between gap-4 w-full">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                          <span className="truncate">{rest.cuisine}</span>
                          <span aria-hidden="true" className="text-zinc-600">·</span>
                          <span className="text-yellow-300 shrink-0">{rest.city}</span>
                        </div>
                        <h3 className="text-lg font-extrabold text-white group-hover:text-yellow-300 transition-colors">
                          {rest.name}
                        </h3>
                        <p className="text-xs font-medium text-zinc-400 truncate">{rest.address}</p>
                        {(sched.businessRange || sched.deliveryRange) && (
                          <div className="pt-1.5 space-y-1 text-[11px] font-semibold">
                            {sched.businessRange && (
                              <p className="text-zinc-300 flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-emerald-400 shrink-0" />
                                <span className="text-zinc-400">Shop:</span>
                                <span className="font-mono-tabular text-white">
                                  {sched.businessRange}
                                </span>
                              </p>
                            )}
                            {sched.deliveryRange && (
                              <p className="text-zinc-300 flex items-center gap-1.5">
                                <Truck className="w-3 h-3 text-amber-400 shrink-0" />
                                <span className="text-zinc-400">Delivery:</span>
                                <span className="font-mono-tabular text-yellow-300">
                                  {sched.deliveryRange}
                                </span>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-3.5 border-t border-zinc-800 text-xs">
                        <span className="inline-flex items-center gap-1 font-mono-tabular font-extrabold text-white">
                          <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                          {rest.rating.toFixed(1)}
                          <span className="text-zinc-400 font-semibold">({rest.reviewCount})</span>
                        </span>
                        <span className="font-mono-tabular font-bold text-amber-400">
                          {rest.deliveryTimeMin} min · from Rs. {rates.customerBaseFeePkr}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Customer Order History & Loyalty Tier Section */}
        <section className="space-y-6 pt-6 border-t border-zinc-800">
          {/* Customer Loyalty Tier Status Card */}
          <div className="p-5 bg-[#0E0E14] border border-amber-500/30 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-base font-extrabold text-white">{customerName}</span>
                <LoyaltyBadge
                  tier={loyaltyTier}
                  completedOrders={completedOrdersCount}
                  size="md"
                />
              </div>
              <p className="text-xs font-semibold text-zinc-400">
                {loyaltyTier.perk} ·{' '}
                <span className="font-mono-tabular font-bold text-amber-300">
                  {completedOrdersCount} completed{' '}
                  {completedOrdersCount === 1 ? 'order' : 'orders'}
                </span>
              </p>
            </div>

            <div className="w-full md:w-72 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-zinc-400">
                  {loyaltyTier.nextTierLabel
                    ? `${loyaltyTier.ordersToNext} more completed ${loyaltyTier.ordersToNext === 1 ? 'order' : 'orders'} to ${loyaltyTier.nextTierLabel}`
                    : 'Top Loyalty Tier Unlocked'}
                </span>
                <span className="font-mono-tabular text-yellow-400">
                  {loyaltyTier.progressPct}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-yellow-300 transition-all duration-500"
                  style={{ width: `${loyaltyTier.progressPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono-tabular text-zinc-500">
                <span>Bronze (0+)</span>
                <span>Silver (3+)</span>
                <span>Gold (6+)</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                <History className="w-6 h-6 text-yellow-400" />
                Order History
              </h2>
              <p className="text-sm font-semibold text-zinc-400 mt-1">
                Review all your past deliveries and quickly re-order from your favorite shops and kitchens.
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#0E0E14] border border-zinc-800 rounded-xl">
              {(
                [
                  { id: 'all', label: `All (${orders.length})` },
                  {
                    id: 'delivered',
                    label: `Delivered (${orders.filter((o) => o.status === 'delivered').length})`,
                  },
                  {
                    id: 'active',
                    label: `Active (${orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setHistoryFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all whitespace-nowrap ${
                    historyFilter === tab.id
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950'
                      : 'text-zinc-400 hover:text-amber-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const visibleOrders = orders.filter((ord) => {
              if (historyFilter === 'delivered') return ord.status === 'delivered';
              if (historyFilter === 'active')
                return ord.status !== 'delivered' && ord.status !== 'cancelled';
              return true;
            });

            if (visibleOrders.length === 0) {
              return (
                <div className="p-10 bg-[#0E0E14] border border-zinc-800 rounded-2xl text-center text-sm font-semibold text-zinc-400">
                  No orders found in this filter yet. Place your first order above to see it here.
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {visibleOrders.map((ord) => {
                  const isDelivered = ord.status === 'delivered';
                  const formattedDate = new Date(ord.createdAt).toLocaleDateString('en-PK', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });

                  return (
                    <div
                      key={ord.id}
                      className="p-5 bg-[#0E0E14] border border-zinc-800 hover:border-amber-500/45 rounded-2xl flex flex-col justify-between gap-4 shadow-xl transition-colors"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-amber-400">
                              <span className="font-mono-tabular font-extrabold text-yellow-400">
                                {ord.orderCode}
                              </span>
                              <span aria-hidden="true" className="text-zinc-600">
                                ·
                              </span>
                              <span>{ord.city}</span>
                              <span aria-hidden="true" className="text-zinc-600">
                                ·
                              </span>
                              <span className="text-zinc-400">{formattedDate}</span>
                            </div>
                            <h3 className="text-base font-extrabold text-white mt-1 truncate">
                              {ord.restaurantName}
                            </h3>
                          </div>

                          <span
                            className={`text-xs font-extrabold capitalize shrink-0 ${
                              isDelivered ? 'text-emerald-400' : 'text-yellow-400'
                            }`}
                          >
                            {ord.status.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <ul className="space-y-1.5 py-2.5 border-y border-zinc-800 text-xs font-semibold text-zinc-300">
                          {ord.items.map((item, idx) => (
                            <li key={idx} className="flex items-center justify-between gap-2">
                              <span className="truncate">
                                {item.quantity}× {item.name}
                              </span>
                              <span className="font-mono-tabular font-bold text-zinc-200 shrink-0">
                                {formatPkr(item.pricePkr * item.quantity)}
                              </span>
                            </li>
                          ))}
                        </ul>

                        <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                          <span>
                            {ord.paymentMethod}
                            {ord.tipPkr ? ` · Tip ${formatPkr(ord.tipPkr)}` : ''}
                            {ord.driverRating ? ` · Rated ${ord.driverRating.toFixed(1)} ★` : ''}
                          </span>
                          <span className="font-mono-tabular text-base font-extrabold text-yellow-400">
                            {formatPkr(ord.totalPkr)}
                          </span>
                        </div>

                        {ord.status === 'cancelled' && (ord.cancellationReason || ord.rejectionReason) && (
                          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs space-y-0.5">
                            <p className="font-extrabold text-rose-300">
                              {ord.cancelledBy === 'customer'
                                ? 'Cancelled by Customer'
                                : ord.cancelledBy === 'admin'
                                  ? 'Cancelled by HSP Operations'
                                  : 'Order Rejected by Store'}
                            </p>
                            <p className="font-semibold text-white">
                              Reason: {ord.cancellationReason || ord.rejectionReason}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1 no-print">
                        <button
                          type="button"
                          onClick={() => onReorder(ord)}
                          className="flex-1 min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-extrabold hover:brightness-105 active:scale-[0.98] inline-flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition-all"
                        >
                          <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                          Re-order Items
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintHistoryOrder(ord)}
                          title="Print order receipt"
                          className="min-h-[42px] px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-extrabold hover:border-amber-400 hover:text-yellow-300 inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Print
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadOrderReceipt(ord)}
                          title="Download order receipt"
                          className="min-h-[42px] px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-extrabold hover:border-amber-400 hover:text-yellow-300 inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Receipt
                        </button>
                        {!isDelivered && ord.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => onTrackOrder(ord.id)}
                            className="min-h-[42px] px-4 py-2 rounded-xl bg-zinc-900 border border-amber-500/40 text-amber-300 text-xs font-extrabold hover:border-yellow-400 hover:text-yellow-200 transition-colors whitespace-nowrap"
                          >
                            Track Live
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>
      </div>

      {/* Print-Only Single Order Receipt */}
      {printOrder && (
        <div className="print-only p-6 border border-slate-300 rounded-xl space-y-4">
          <div className="border-b border-slate-300 pb-3">
            <h2 className="text-xl font-extrabold">HSP delivery — Order Receipt</h2>
            <p className="text-xs">
              Order {printOrder.orderCode} · {printOrder.restaurantName} ({printOrder.city}) ·{' '}
              {new Date(printOrder.createdAt).toLocaleString('en-PK')}
            </p>
          </div>
          <div className="text-xs space-y-1">
            <p>
              <strong>Customer:</strong> {printOrder.customerName} ({printOrder.customerPhone})
            </p>
            <p>
              <strong>Address:</strong> {printOrder.deliveryAddress}
            </p>
            <p>
              <strong>Payment:</strong> {printOrder.paymentMethod} ·{' '}
              {printOrder.status.replace(/_/g, ' ').toUpperCase()}
            </p>
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="py-1.5 text-left">Item</th>
                <th className="py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {printOrder.items.map((it, idx) => (
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
          <div className="text-xs space-y-1 pt-2 border-t border-slate-300">
            <div className="flex justify-between">
              <span>Delivery Fee</span>
              <span className="font-mono-tabular">{formatPkr(printOrder.deliveryFeePkr)}</span>
            </div>
            {(printOrder.tipPkr ?? 0) > 0 && (
              <div className="flex justify-between">
                <span>Rider Tip</span>
                <span className="font-mono-tabular">{formatPkr(printOrder.tipPkr || 0)}</span>
              </div>
            )}
          </div>
          <div className="text-sm font-extrabold flex justify-between pt-2 border-t border-slate-300">
            <span>Total Paid / COD</span>
            <span className="font-mono-tabular">{formatPkr(printOrder.totalPkr)}</span>
          </div>
        </div>
      )}

      {/* Floating Gold Cart Bar */}
      {cartCount > 0 && (
        <div className="fixed bottom-20 lg:bottom-6 left-4 right-4 lg:left-auto lg:right-8 lg:w-96 z-40 no-print">
          <button
            type="button"
            onClick={onOpenCheckout}
            className="w-full px-5 py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-400 text-zinc-950 shadow-[0_12px_36px_rgba(250,204,21,0.35)] hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-between"
          >
            <span className="inline-flex items-center gap-2 text-sm font-extrabold">
              <ShoppingBag className="w-4 h-4 stroke-[2.5]" />
              Checkout ({cartCount} items)
            </span>
            <span className="font-mono-tabular font-extrabold text-sm">
              {formatPkr(cartTotal)}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
