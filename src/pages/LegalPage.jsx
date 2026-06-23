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
We accept Cash on Delivery and Whish Money. Prices are displayed in USD; the equivalent in LBP may be collected at the current exchange rate.

### 3. Delivery
We deliver across Lebanon. Delivery times and fees vary by area and are confirmed at checkout; a free-delivery threshold may apply. Please see our Shipping Policy for current details.

### 4. Returns & Exchanges
We offer **exchanges only** (no cash refunds). You must notify us within 24 hours of delivery, and the exchange may be completed within 14 days. Exact stock is not guaranteed. See our Returns & Exchanges Policy for full terms.

### 5. Intellectual Property
All content on this site belongs to MiniYo and may not be reproduced without permission.

### 6. Limitation of Liability
MiniYo is not liable for indirect or consequential losses arising from the use of this website or our products, to the extent permitted by law.

### 7. Governing Law
These Terms are governed by the laws of **Lebanon**, and any disputes shall be subject to the jurisdiction of the Lebanese courts.
`,
    default_ar: `## الشروط والأحكام

**آخر تحديث: يونيو 2026**

باستخدامك موقع MiniYo فإنك توافق على هذه الشروط.

### 1. الطلبات
- تخضع جميع الطلبات لتوافر المنتج.
- الأسعار بالدولار الأمريكي.
- نحتفظ بالحق في إلغاء الطلبات التي لا يمكن تنفيذها.

### 2. الدفع
نقبل الدفع عند الاستلام وتطبيق Whish. تُعرض الأسعار بالدولار الأمريكي، وقد يُحصّل ما يعادلها بالليرة اللبنانية وفق سعر الصرف الحالي.

### 3. التوصيل
نوصّل إلى جميع مناطق لبنان. تختلف مواعيد ورسوم التوصيل حسب المنطقة وتُؤكَّد عند إتمام الطلب، وقد ينطبق حد للتوصيل المجاني. يُرجى مراجعة سياسة الشحن لمعرفة التفاصيل الحالية.

### 4. الإرجاع والاستبدال
نقدّم **الاستبدال فقط** (لا استرداد نقدي). يجب إبلاغنا خلال 24 ساعة من التسليم، ويمكن إتمام الاستبدال خلال 14 يوماً. لا يمكن ضمان توفّر المخزون بالضبط. راجع سياسة الإرجاع والاستبدال للاطلاع على الشروط الكاملة.

### 5. الملكية الفكرية
جميع محتويات الموقع ملك لـ MiniYo ولا يجوز إعادة إنتاجها دون إذن.

### 6. حدود المسؤولية
لا تتحمّل MiniYo المسؤولية عن أي خسائر غير مباشرة أو تبعية ناتجة عن استخدام هذا الموقع أو منتجاتنا، بالقدر الذي يسمح به القانون.

### 7. القانون الحاكم
تخضع هذه الشروط لقوانين **لبنان**، وتكون أي نزاعات خاضعة لاختصاص المحاكم اللبنانية.
`
  },
  shipping: {
    key: 'legal_shipping',
    en: { title: 'Shipping Policy', desc: 'Delivery times and fees across Lebanon.' },
    ar: { title: 'سياسة الشحن', desc: 'مواعيد وأسعار التوصيل في لبنان.' },
    default_en: `## Shipping Policy

**Last updated: June 2026**

### Delivery Areas
We deliver nationwide across Lebanon.

### Delivery Fees & Times
Delivery fees and estimated times vary by area and are **confirmed at checkout**. As a general guide, deliveries within the Tripoli area are usually faster, while other regions may take a few business days. (Exact rates are configurable and shown at checkout.)

### Free Shipping
A free-shipping threshold may apply to larger orders — the current threshold, if any, is shown at checkout.

### Order Processing
Orders are typically processed within 1 business day. You will receive a WhatsApp confirmation once your order is dispatched.

### Cash on Delivery
Cash on Delivery is available. Payment is collected upon delivery in USD or the equivalent in LBP at the current exchange rate.
`,
    default_ar: `## سياسة الشحن

**آخر تحديث: يونيو 2026**

### مناطق التوصيل
نوصّل إلى جميع المناطق في لبنان.

### رسوم ومواعيد التوصيل
تختلف رسوم ومواعيد التوصيل حسب المنطقة وتُؤكَّد **عند إتمام الطلب**. بشكل عام، يكون التوصيل داخل منطقة طرابلس أسرع، بينما قد تستغرق المناطق الأخرى بضعة أيام عمل. (الأسعار قابلة للتعديل وتظهر عند الدفع.)

### الشحن المجاني
قد ينطبق حد للشحن المجاني على الطلبات الأكبر — يظهر الحد الحالي، إن وُجد، عند الدفع.

### معالجة الطلبات
تُعالَج الطلبات عادةً خلال يوم عمل واحد. ستتلقى تأكيداً عبر واتساب بمجرد إرسال طلبك.

### الدفع عند الاستلام
الدفع عند الاستلام متاح. يُحصّل المبلغ عند التسليم بالدولار الأمريكي أو ما يعادله بالليرة اللبنانية وفق سعر الصرف الحالي.
`
  },
  returns: {
    key: 'legal_returns',
    en: { title: 'Returns & Exchanges', desc: 'How to return or exchange a MiniYo order.' },
    ar: { title: 'الإرجاع والاستبدال', desc: 'كيفية إرجاع أو استبدال طلب MiniYo.' },
    default_en: `## Returns & Exchanges Policy

**Last updated: June 2026**

At MiniYo we want you and your little one to love every order. Please read our exchange policy carefully.

### Exchange Only — No Cash Refunds
We offer **exchanges only**. We do not provide cash refunds. If something isn't right, we'll help you exchange it under the terms below.

### 24-Hour Notification + 14-Day Window
- You must **notify us within 24 hours of delivery** if you wish to exchange an item.
- Once you have notified us in time, the exchange can be completed **within 14 days** of delivery.
- Requests made after the first 24 hours unfortunately cannot be accepted.

### Condition of Items
To be eligible for exchange, items must be:
- **Unworn and unwashed**, in their original condition
- With **all original tags attached** and in their **original packaging**

### Stock Availability
- **Exact stock cannot be guaranteed.** The specific item, size, or colour you'd like in exchange may no longer be available.
- If the **same item is not available**, you may choose an **alternative item**, and the **same discounts** applied to your original purchase will be honoured on the replacement.
- If the **price of the replacement item is higher** than the item being exchanged, you will **pay the difference**. If it is lower, the difference is not refunded (exchange only).

### Non-Exchangeable Items
For hygiene reasons, the following cannot be exchanged: socks, underwear, bibs, pacifiers, and similar intimate or single-use items — unless they arrive faulty.

### How to Request an Exchange
1. **Message us on WhatsApp within 24 hours of delivery** with your order number and the reason.
2. We'll confirm your exchange and arrange the next steps.
3. The customer is responsible for delivering the item back to us or covering return delivery; the replacement is then sent to you.

### Damaged or Incorrect Items
If you received a damaged or incorrect item, contact us **within 24 hours of delivery** and we will arrange a replacement at no extra cost.
`,
    default_ar: `## سياسة الإرجاع والاستبدال

**آخر تحديث: يونيو 2026**

في MiniYo نريدك أنت وصغيرك أن تحبّا كل طلب. يُرجى قراءة سياسة الاستبدال بعناية.

### استبدال فقط — لا استرداد نقدي
نقدّم **الاستبدال فقط**، ولا نقدّم استرداداً نقدياً. إذا لم يكن المنتج مناسباً، سنساعدك على استبداله وفق الشروط أدناه.

### إشعار خلال 24 ساعة + فترة 14 يوماً
- يجب **إبلاغنا خلال 24 ساعة من استلام الطلب** إذا رغبت في استبدال منتج.
- بعد إبلاغنا ضمن المهلة، يمكن إتمام الاستبدال **خلال 14 يوماً** من التسليم.
- لا يمكننا للأسف قبول الطلبات بعد مرور أول 24 ساعة.

### حالة المنتجات
لتكون مؤهلة للاستبدال، يجب أن تكون المنتجات:
- **غير مرتداة وغير مغسولة** وبحالتها الأصلية
- مع **جميع الوسوم الأصلية مرفقة** وفي **تغليفها الأصلي**

### توفّر المخزون
- **لا يمكن ضمان توفّر المخزون بالضبط.** قد لا يكون المنتج أو المقاس أو اللون المطلوب للاستبدال متوفراً.
- إذا لم يكن **المنتج نفسه متوفراً**، يمكنك اختيار **منتج بديل**، وستُطبَّق **نفس الخصومات** التي كانت على طلبك الأصلي على المنتج البديل.
- إذا كان **سعر المنتج البديل أعلى** من المنتج المُستبدَل، فستدفع **الفرق**. وإذا كان أقل، لا يُسترد الفرق (استبدال فقط).

### منتجات غير قابلة للاستبدال
لأسباب صحية، لا يمكن استبدال: الجوارب، الملابس الداخلية، المرايل، اللهايات، والمنتجات المشابهة ذات الاستخدام الشخصي أو الواحد — إلا إذا وصلت معيبة.

### كيفية طلب الاستبدال
1. **راسلنا عبر واتساب خلال 24 ساعة من الاستلام** برقم الطلب والسبب.
2. سنؤكد الاستبدال ونرتّب الخطوات التالية.
3. يتحمّل العميل مسؤولية إيصال المنتج إلينا أو تغطية تكلفة إعادته، ثم يُرسَل المنتج البديل إليك.

### المنتجات التالفة أو الخاطئة
إذا استلمت منتجاً تالفاً أو غير صحيح، تواصل معنا **خلال 24 ساعة من التسليم** وسنرتّب الاستبدال دون أي تكلفة إضافية.
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