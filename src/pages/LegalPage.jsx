import React from 'react';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const PAGE_META = {
  contact: {
    key: 'legal_contact',
    en: { title: 'Contact Us', desc: 'Get in touch with the MiniYo team.' },
    ar: { title: 'تواصل معنا', desc: 'تواصل مع فريق MiniYo.' },
    default_en: `## Contact Us\n\nWhatsApp us or email management@miniyo.store — we'd love to hear from you!`,
    default_ar: `## تواصل معنا\n\nراسلنا عبر واتساب أو على management@miniyo.store — يسعدنا التواصل معك!`,
  },
  privacy: {
    key: 'legal_privacy',
    en: { title: 'Privacy Policy', desc: 'How MiniYo collects and uses your data.' },
    ar: { title: 'سياسة الخصوصية', desc: 'كيف تجمع MiniYo بياناتك وتستخدمها.' },
    default_en: `## Privacy Policy

**Last updated: June 2026**

### 1. Information We Collect
We collect information you provide directly — name, phone number, delivery address, and email — when you place an order or create an account.

### 2. How We Use Your Information
- To process and deliver your orders
- To send order status updates via WhatsApp or email
- To improve our service

### 3. Sharing Your Data
We do not sell your personal data. We share it only with delivery partners as needed to fulfil your order.

### 4. Data Retention
We retain your data for as long as your account is active, or as needed to provide services.

### 5. Contact
Questions? Reach us on WhatsApp or Instagram @miniyo.lb
`,
    default_ar: `## سياسة الخصوصية

**آخر تحديث: يونيو 2026**

### 1. المعلومات التي نجمعها
نجمع المعلومات التي تقدمها مباشرة — الاسم، ورقم الهاتف، وعنوان التوصيل، والبريد الإلكتروني — عند تقديم طلب أو إنشاء حساب.

### 2. كيف نستخدم معلوماتك
- لمعالجة طلباتك وتوصيلها
- لإرسال تحديثات حالة الطلب عبر واتساب أو البريد الإلكتروني
- لتحسين خدمتنا

### 3. مشاركة بياناتك
لا نبيع بياناتك الشخصية. نشاركها فقط مع شركاء التوصيل حسب الحاجة لتنفيذ طلبك.

### 4. الاحتفاظ بالبيانات
نحتفظ ببياناتك طالما حسابك نشط، أو حسب الحاجة لتقديم الخدمات.

### 5. تواصل معنا
أسئلة؟ تواصل معنا عبر واتساب أو انستغرام @miniyo.lb
`
  },
  terms: {
    key: 'legal_terms',
    en: { title: 'Terms & Conditions', desc: 'Terms governing use of MiniYo.' },
    ar: { title: 'الشروط والأحكام', desc: 'الشروط التي تحكم استخدام MiniYo.' },
    default_en: `## Terms & Conditions

**Last updated: June 2026**

By using the MiniYo website you agree to these terms.

### 1. Orders
- All orders are subject to product availability.
- Prices are in USD and include VAT where applicable.
- We reserve the right to cancel orders that cannot be fulfilled.

### 2. Payment
We accept Cash on Delivery and Whish Money.

### 3. Delivery
- Inside Tripoli: $2–3 / 1–2 business days
- Outside Tripoli: $5 / 2–5 business days
- Free delivery on orders above $50

### 4. Returns & Exchanges
See our Returns Policy page.

### 5. Intellectual Property
All content on this site belongs to MiniYo and may not be reproduced without permission.
`,
    default_ar: `## الشروط والأحكام

**آخر تحديث: يونيو 2026**

باستخدامك موقع MiniYo فإنك توافق على هذه الشروط.

### 1. الطلبات
- تخضع جميع الطلبات لتوافر المنتج.
- الأسعار بالدولار الأمريكي.
- نحتفظ بالحق في إلغاء الطلبات التي لا يمكن تنفيذها.

### 2. الدفع
نقبل الدفع عند الاستلام وتطبيق Whish.

### 3. التوصيل
- داخل طرابلس: 2-3 دولار / 1-2 أيام عمل
- خارج طرابلس: 5 دولار / 2-5 أيام عمل
- توصيل مجاني للطلبات فوق 50 دولار

### 4. الإرجاع والاستبدال
راجع صفحة سياسة الإرجاع.

### 5. الملكية الفكرية
جميع محتويات الموقع ملك لـ MiniYo ولا يجوز إعادة إنتاجها دون إذن.
`
  },
  shipping: {
    key: 'legal_shipping',
    en: { title: 'Shipping Policy', desc: 'Delivery times and fees across Lebanon.' },
    ar: { title: 'سياسة الشحن', desc: 'مواعيد وأسعار التوصيل في لبنان.' },
    default_en: `## Shipping Policy

**Last updated: June 2026**

### Delivery Areas
We deliver to all areas in Lebanon.

### Delivery Fees
| Zone | Fee | Estimated Time |
|------|-----|----------------|
| Inside Tripoli | $2 | Same day / Next day |
| Outside Tripoli | $5 | 2–5 business days |

### Free Shipping
Orders over **$50** qualify for free shipping.

### Order Processing
Orders are processed within 1 business day. You will receive a WhatsApp confirmation once your order is dispatched.

### Cash on Delivery
Payment is collected upon delivery in USD or the equivalent in LBP at the current exchange rate.
`,
    default_ar: `## سياسة الشحن

**آخر تحديث: يونيو 2026**

### مناطق التوصيل
نوصّل إلى جميع مناطق لبنان.

### رسوم التوصيل
| المنطقة | الرسوم | الوقت المتوقع |
|---------|---------|----------------|
| داخل طرابلس | 2 دولار | نفس اليوم / اليوم التالي |
| خارج طرابلس | 5 دولار | 2–5 أيام عمل |

### الشحن المجاني
الطلبات التي تتجاوز **50 دولار** تحصل على شحن مجاني.

### معالجة الطلبات
تُعالَج الطلبات خلال يوم عمل واحد. ستتلقى تأكيداً عبر واتساب بمجرد إرسال طلبك.

### الدفع عند الاستلام
يُحصّل المبلغ عند التسليم بالدولار الأمريكي أو ما يعادله بالليرة اللبنانية.
`
  },
  returns: {
    key: 'legal_returns',
    en: { title: 'Returns & Exchanges', desc: 'How to return or exchange a MiniYo order.' },
    ar: { title: 'الإرجاع والاستبدال', desc: 'كيفية إرجاع أو استبدال طلب MiniYo.' },
    default_en: `## Returns & Exchanges Policy

**Last updated: June 2026**

### 14-Day Return Window
You may return unworn, unwashed items in original packaging within **14 days** of delivery.

### Eligible Items
- Items must be in original condition with tags attached
- Sale items are final sale (no returns)

### How to Return
1. WhatsApp us your order number and reason for return
2. We will arrange a pickup or drop-off point
3. Refunds are processed within 5 business days after we receive the item

### Exchanges
We're happy to exchange for a different size or color, subject to availability.

### Damaged / Wrong Items
If you received a damaged or incorrect item, contact us within 48 hours of delivery and we will replace it at no cost.
`,
    default_ar: `## سياسة الإرجاع والاستبدال

**آخر تحديث: يونيو 2026**

### فترة الإرجاع 14 يوماً
يمكنك إرجاع المنتجات غير المرتداة وغير المغسولة في تغليفها الأصلي خلال **14 يوماً** من التسليم.

### المنتجات المؤهلة
- يجب أن تكون المنتجات بحالتها الأصلية مع الوسوم مرفقة
- منتجات التخفيضات نهائية (لا إرجاع)

### كيفية الإرجاع
1. راسلنا عبر واتساب برقم طلبك وسبب الإرجاع
2. سنرتب لاستلامه أو نقطة إسقاط
3. تُعالَج المبالغ المستردة خلال 5 أيام عمل بعد استلام المنتج

### الاستبدال
يسعدنا استبدال المقاس أو اللون حسب التوافر.

### المنتجات التالفة أو الخاطئة
إذا استلمت منتجاً تالفاً أو غير صحيح، تواصل معنا خلال 48 ساعة من التسليم وسنستبدله بدون تكلفة.
`
  }
};

export default function LegalPage() {
  const { slug } = useParams();
  const { lang, t } = useLang();

  const meta = PAGE_META[slug];

  const { data: sections = [] } = useQuery({
    queryKey: ['cms-legal', meta.key],
    queryFn: () => base44.entities.CmsSection.filter({ section_key: meta.key }, 'sort_order', 1),
    staleTime: 60_000,
  });

  if (!meta) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Page not found</div>;

  const section = sections[0];
  const content = lang === 'ar'
    ? (section?.body_ar || section?.body || meta.default_ar)
    : (section?.body || meta.default_en);
  const title = lang === 'ar' ? meta.ar.title : meta.en.title;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> {t('Back to Home', 'العودة للرئيسية')}
        </Link>
        <h1 className="text-3xl font-heading font-bold text-foreground mb-8">{title}</h1>
        <div className="prose prose-sm max-w-none text-foreground prose-headings:font-heading prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}