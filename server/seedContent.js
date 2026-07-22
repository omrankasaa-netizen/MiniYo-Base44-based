// Canonical storefront copy used to seed CmsSection (legal/about) and Faq rows
// when they are missing in the database. Mirrors the built-in fallback copy in
// src/pages/LegalPage.jsx / AboutPage.jsx so the public pages are never blank.
// Lebanon-adapted: USD pricing, exchange-only returns, governing law = Lebanon.

export const LEGAL_SECTIONS = [
  {
    section_key: 'legal_contact',
    title: 'Contact Us',
    title_ar: 'تواصل معنا',
    body: `## Contact Us\n\nWhatsApp us or email management@miniyo.store — we'd love to hear from you!`,
    body_ar: `## تواصل معنا\n\nراسلنا عبر واتساب أو على management@miniyo.store — يسعدنا التواصل معك!`,
  },
  {
    section_key: 'legal_privacy',
    title: 'Privacy Policy',
    title_ar: 'سياسة الخصوصية',
    body: `## Privacy Policy

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
Questions? Reach us on WhatsApp or Instagram @miniyo.store.lb
`,
    body_ar: `## سياسة الخصوصية

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
أسئلة؟ تواصل معنا عبر واتساب أو انستغرام @miniyo.store.lb
`,
  },
  {
    section_key: 'legal_terms',
    title: 'Terms & Conditions',
    title_ar: 'الشروط والأحكام',
    body: `## Terms & Conditions

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
    body_ar: `## الشروط والأحكام

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
`,
  },
  {
    section_key: 'legal_shipping',
    title: 'Shipping Policy',
    title_ar: 'سياسة الشحن',
    body: `## Shipping Policy

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
    body_ar: `## سياسة الشحن

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
`,
  },
  {
    section_key: 'legal_returns',
    title: 'Returns & Exchanges',
    title_ar: 'الإرجاع والاستبدال',
    body: `## Returns & Exchanges Policy

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
    body_ar: `## سياسة الإرجاع والاستبدال

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
`,
  },
  {
    section_key: 'page_about',
    title: 'Our Story',
    title_ar: 'قصتنا',
    body: `MiniYo was born out of one of the hardest chapters of our lives — and somehow became the most meaningful thing we've ever built.

We're a small family from Tripoli. Like so many people across Lebanon, the events of the past few years hit us harder than we ever expected. We lost our jobs. The stability we'd worked toward disappeared almost overnight.

We were left with two young children, a lot of uncertainty — and a choice: let it break us, or build something new.

## Why Clothes?

As parents of two little ones, we kept searching for baby clothes that were soft enough, affordable enough, and actually beautiful — and kept coming up short. Parents in Lebanon deserve better. So we decided to create it ourselves.

## What MiniYo Means

**MiniYo** started as a nickname for our youngest — our little *mini me*. It stuck. And it felt right for a brand built around one idea: children bring joy, and they deserve to wear it too.

Thank you for being part of our story. 🤍

— The MiniYo Family
`,
    body_ar: `وُلدت MiniYo من واحدة من أصعب فترات حياتنا — وأصبحت بطريقة ما أكثر شيء ذي معنى بنيناه على الإطلاق.

نحن عائلة صغيرة من طرابلس. مثل كثيرين في لبنان، أثّرت بنا أحداث السنوات الأخيرة أكثر مما توقعنا. فقدنا أعمالنا، واختفى الاستقرار الذي عملنا من أجله تقريباً بين ليلة وضحاها.

بقي لدينا طفلان صغيران وكثير من الغموض — وخيار: أن ندع ذلك يكسرنا، أو أن نبني شيئاً جديداً.

## لماذا الملابس؟

بصفتنا والدين لطفلين صغيرين، بحثنا طويلاً عن ملابس أطفال ناعمة بما يكفي، وبأسعار مناسبة، وجميلة فعلاً — ولم نجد ما يكفي. يستحق الأهل في لبنان الأفضل، فقررنا أن نصنعه بأنفسنا.

## ماذا تعني MiniYo

بدأت **MiniYo** كاسم دلع لصغيرنا — *الميني مي* الصغير. وبقي الاسم. وشعرنا أنه مناسب لعلامة بُنيت حول فكرة واحدة: الأطفال يجلبون الفرح، ويستحقون أن يرتدوه أيضاً.

شكراً لكونك جزءاً من قصتنا. 🤍

— عائلة MiniYo
`,
  },
];

// Sensible starter FAQs (bilingual). Categories match FaqPage CATEGORY_ORDER.
export const FAQS = [
  {
    category: 'Returns & Exchanges',
    question: 'What is your return / exchange policy?',
    question_ar: 'ما هي سياسة الإرجاع والاستبدال لديكم؟',
    answer: 'We offer exchanges only (no cash refunds). Notify us within 24 hours of delivery, and the exchange can be completed within 14 days. Items must be unworn, with original tags and packaging. For hygiene reasons, socks, underwear, bibs and pacifiers cannot be exchanged unless faulty.',
    answer_ar: 'نقدّم الاستبدال فقط (لا استرداد نقدي). أبلغنا خلال 24 ساعة من الاستلام، ويمكن إتمام الاستبدال خلال 14 يوماً. يجب أن تكون المنتجات غير مرتداة وبوسومها وتغليفها الأصلي. لأسباب صحية لا يمكن استبدال الجوارب والملابس الداخلية والمرايل واللهايات إلا إذا كانت معيبة.',
  },
  {
    category: 'Returns & Exchanges',
    question: 'The item I want is out of stock for my exchange. What happens?',
    question_ar: 'المنتج الذي أريده للاستبدال غير متوفر. ماذا يحدث؟',
    answer: 'Exact stock is not guaranteed. If the same item is unavailable, you can choose an alternative item and the same discounts from your original order will be honoured. If the replacement costs more, you pay the difference.',
    answer_ar: 'لا يمكن ضمان توفّر المخزون بالضبط. إذا لم يتوفر المنتج نفسه، يمكنك اختيار منتج بديل وستُطبَّق نفس خصومات طلبك الأصلي. إذا كان البديل أغلى، تدفع الفرق.',
  },
  {
    category: 'Payment',
    question: 'What payment methods do you accept?',
    question_ar: 'ما هي طرق الدفع المتاحة؟',
    answer: 'We accept Cash on Delivery and Whish Money. Prices are shown in USD; the equivalent in LBP may be collected at the current exchange rate.',
    answer_ar: 'نقبل الدفع عند الاستلام وتطبيق Whish. تُعرض الأسعار بالدولار الأمريكي، وقد يُحصّل ما يعادلها بالليرة اللبنانية وفق سعر الصرف الحالي.',
  },
  {
    category: 'Shipping & Delivery',
    question: 'How long does delivery take and how much does it cost?',
    question_ar: 'كم يستغرق التوصيل وكم تكلفته؟',
    answer: 'We deliver across all of Lebanon. Fees and times vary by area and are confirmed at checkout — deliveries within Tripoli are usually faster, while other regions may take a few business days. A free-delivery threshold may apply.',
    answer_ar: 'نوصّل إلى جميع مناطق لبنان. تختلف الرسوم والمواعيد حسب المنطقة وتُؤكَّد عند الدفع — التوصيل داخل طرابلس أسرع عادةً، بينما قد تستغرق المناطق الأخرى بضعة أيام عمل. وقد ينطبق حد للتوصيل المجاني.',
  },
  {
    category: 'Orders',
    question: 'How do I place an order?',
    question_ar: 'كيف أقدّم طلباً؟',
    answer: 'Add the items you love to your cart and check out. You will receive a WhatsApp confirmation, and your order is usually processed within 1 business day.',
    answer_ar: 'أضف المنتجات التي تحبها إلى السلة وأكمل الطلب. ستتلقى تأكيداً عبر واتساب، وتُعالَج طلباتك عادةً خلال يوم عمل واحد.',
  },
  {
    category: 'Products & Sizing',
    question: 'How do I choose the right size?',
    question_ar: 'كيف أختار المقاس المناسب؟',
    answer: 'Each product lists its available sizes by age range. If you are between sizes or unsure, message us on WhatsApp and we will help you pick the best fit.',
    answer_ar: 'يعرض كل منتج المقاسات المتوفرة حسب الفئة العمرية. إذا كنت بين مقاسين أو غير متأكد، راسلنا عبر واتساب وسنساعدك على اختيار الأنسب.',
  },
  {
    category: 'Orders',
    question: 'How can I contact you?',
    question_ar: 'كيف يمكنني التواصل معكم؟',
    answer: 'The fastest way is WhatsApp. You can also email management@miniyo.store or reach us on Instagram @miniyo.store.lb.',
    answer_ar: 'أسرع طريقة هي واتساب. يمكنك أيضاً مراسلتنا على management@miniyo.store أو عبر انستغرام @miniyo.store.lb.',
  },
];
