import { Review, ProductSize } from '../types';

/**
 * Authentic, non-repeating Indian female customer names pool.
 * Over 75 unique names ensure zero repetition when generating 40+ reviews for a product.
 */
const INDIAN_CUSTOMER_NAMES: string[] = [
  'Ananya Sharma', 'Priya Patel', 'Meera Iyer', 'Sneha Reddy', 'Ritu Verma',
  'Kavita Joshi', 'Pooja Nair', 'Divya Agarwal', 'Shreya Malhotra', 'Tanvi Deshmukh',
  'Aditi Rao', 'Sunita Choudhary', 'Neha Gupta', 'Tanya Saxena', 'Shweta Singh',
  'Ishita Sen', 'Roshni Kapoor', 'Deepika Das', 'Bhavna Shah', 'Shruti Pillai',
  'Vandana Mehta', 'Nisha Tiwari', 'Payal Mukherjee', 'Swati Bhatt', 'Simran Kaur',
  'Preeti Bansal', 'Komal Pandey', 'Mansi Kulkarni', 'Radhika Menon', 'Ankita Bose',
  'Garima Rawat', 'Jyoti Yadav', 'Aarti Mishra', 'Pallavi Kulkarni', 'Richa Singhal',
  'Sanya Grover', 'Nidhi Chauhan', 'Chetna Hegde', 'Urvashi Bhatia', 'Shilpa Nambiar',
  'Taruna Sethi', 'Harini Sundaram', 'Monali Roy', 'Geeta Solanki', 'Leena Chawla',
  'Vidya Krishnan', 'Priyanka Kaushik', 'Shalini Goyal', 'Meenakshi Sundaram', 'Rupal Jain',
  'Karuna Tripathi', 'Damini Sen', 'Archana Bhardwaj', 'Namrata Desai', 'Charu Mathur',
  'Sakshi Mahajan', 'Tina Lamba', 'Rashmi Shukla', 'Smriti Sinha', 'Alisha Khanna',
  'Barkha Anand', 'Hema Upadhyay', 'Rupali Sawant', 'Bina Trivedi', 'Kritika Sen',
  'Aparna Nambisan', 'Devika Pillai', 'Bhavika Bhatnagar', 'Madhuri Dixit', 'Suman Lata',
  'Reena Kashyap', 'Manju Shekhawat', 'Babita Bisht', 'Gauri Nadkarni', 'Esha Deol'
];

const CITIES: string[] = [
  'Jaipur', 'New Delhi', 'Mumbai', 'Bengaluru', 'Pune', 'Lucknow',
  'Chandigarh', 'Hyderabad', 'Ahmedabad', 'Kolkata', 'Indore', 'Surat',
  'Noida', 'Gurugram', 'Bhopal', 'Nagpur', 'Vadodara', 'Dehradun'
];

const SIZES: ProductSize[] = ['S', 'M', 'L', 'XL', 'XXL'];

/**
 * 60 distinct review comments covering fabric, fit, occasion, stitching, dupatta, and colors.
 * Carefully phrased with realistic customer experiences.
 */
const REVIEW_COMMENTS: Array<{ text: string; rating: number }> = [
  { text: 'Fabric bohot hi soft aur comfortable hai! Family function me pehna tha, sabhi ne colour aur fitting ki bohot tareef ki.', rating: 5 },
  { text: 'The embroidery work on the neckline is exquisite. Exactly matches what is shown in the catalog. Very satisfied!', rating: 5 },
  { text: 'Pure cotton feel, breathable for summer and festive occasions. Washing ke baad bhi colour bilkul fade nahi hua.', rating: 5 },
  { text: 'Fitting is true to size. Kurti length is ideal with palazzo pants. Loved the dupatta texture.', rating: 5 },
  { text: 'Packaging was neat and luxurious. Arrived in just 3 days! Stitching quality is top notch.', rating: 5 },
  { text: 'Dresses usually don’t fit me on the waist easily, but this one fit like it was custom tailored. 10/10.', rating: 5 },
  { text: 'Paisa vasool outfit! Wore it to my cousin’s sangeet and received endless compliments.', rating: 5 },
  { text: 'The rich festive colour looks even better in person than in the photos. Very happy with the purchase.', rating: 5 },
  { text: 'Dupatta length is generous and light to carry. Comfortable to wear all day during office pooja.', rating: 5 },
  { text: 'Fabric has a beautiful subtle sheen. Premium finish without feeling heavy on the body.', rating: 5 },
  { text: 'Stitching margins are provided inside which is thoughtful. High quality lining under the kurti.', rating: 4 },
  { text: 'Very elegant set. Soft cloth and neat interlock inside. Will definitely order in another shade.', rating: 5 },
  { text: 'Sleeve detailing and hem borders look classy. Fabric feels very gentle against the skin.', rating: 5 },
  { text: 'Ordered M size and it fits perfectly. No alteration needed at all.', rating: 5 },
  { text: 'Loved the flare of the anarkali! Gives a royal festive vibe while keeping movement light.', rating: 5 },
  { text: 'The prints and borders are crisp and clean. One of my favorite ethnic purchases this year.', rating: 5 },
  { text: 'Fabric quality is genuinely good. It didn’t shrink after gentle wash. Highly recommended.', rating: 5 },
  { text: 'Comfortable elastic on pants with pockets! Suit Aura Girls always delivers good ethnic designs.', rating: 5 },
  { text: 'So subtle and graceful. Perfect for festive celebrations, temple visits, and office celebrations.', rating: 5 },
  { text: 'Beautiful outfit! Good fabric weight, not see-through at all. Looks very classy.', rating: 5 },
  { text: 'Colour is rich and stitching is strong. Delivery was quick and customer support on WhatsApp was responsive.', rating: 5 },
  { text: 'Very nice cut and silhouette. Neck pattern looks decent and dignified.', rating: 5 },
  { text: 'Kurti flare and drape are superb. Got lots of compliments at our Diwali get-together.', rating: 5 },
  { text: 'Comfortable cotton lining inside. Doesn’t itch at all even after 8 hours of wearing.', rating: 5 },
  { text: 'The shade of pink and gold border complement each other so well. True ethnic elegance.', rating: 5 },
  { text: 'Great buy at this price point! Ready-to-wear set that looks like boutique designer wear.', rating: 5 },
  { text: 'Loved the fabric texture and fine threadwork. Pants length is just right for 5ft 4in height.', rating: 4 },
  { text: 'Very refreshing ethnic design. The fabric falls nicely and does not wrinkle easily.', rating: 5 },
  { text: 'Gifted this to my sister on Rakhi and she absolutely loved the fabric and color vibrancy.', rating: 5 },
  { text: 'Neat packaging in a zip pouch. Suit looks fresh and ironed out of the box.', rating: 5 },
  { text: 'The kurti cut is very flattering. Pure festive charm and easy to carry.', rating: 5 },
  { text: 'Very good fabric quality. Kurta has proper breathing room and feels airy.', rating: 4 },
  { text: 'Looks so graceful in daylight photos! Dupatta adds an instant festive touch.', rating: 5 },
  { text: 'The fabric feels pure and natural. Stitching is durable and borders are securely attached.', rating: 5 },
  { text: 'Size L was spot on for my measurements. Comfortable armholes and clean neck design.', rating: 5 },
  { text: 'Simple, elegant, yet royal. Exactly the kind of ethnic wear modern women look for.', rating: 5 },
  { text: 'Super fast delivery to Jaipur. Fabric feels soft and luxurious.', rating: 5 },
  { text: 'Wore it for karwa chauth pooja. Loved how festive yet lightweight it felt throughout the day.', rating: 5 },
  { text: 'Very pleased with the purchase. Color is bright and fabric has good density.', rating: 4 },
  { text: 'Finishing is comparable to top ethnic brands at half the price.', rating: 5 },
  { text: 'The yoke embroidery is subtle and not over the top. Perfect for formal ethnic occasions.', rating: 5 },
  { text: 'Pant has comfortable elastic waist and decent pockets. Fabric is soft and gentle.', rating: 5 },
  { text: 'Colour does not bleed during wash. True to size and nicely stitched.', rating: 5 },
  { text: 'Good quality festive suit. Pants length is appropriate and flare looks gorgeous.', rating: 4 },
  { text: 'Very graceful outfit. It looks very decent on video calls and festive gatherings alike.', rating: 5 },
  { text: 'The fabric breathes well and doesn’t cling to the skin. Very pleased with Suit Aura Girls.', rating: 5 },
  { text: 'Drape is very smooth. Got so many inquiries about where I bought this from!', rating: 5 },
  { text: 'Loved the craftsmanship. Clean threadwork without any loose threads.', rating: 5 },
  { text: 'Authentic Indian ethnic feel. The colour combination is unique and pleasing.', rating: 5 },
  { text: 'Ordered size XL and the fitting was relaxed and comfortable just like I wanted.', rating: 4 },
  { text: 'Very pretty kurti set. Dupatta material is soft and easily manageable.', rating: 5 },
  { text: 'Fabric has a rich texture. It looks regal with simple oxidized jewelry.', rating: 5 },
  { text: 'Loved the overall finish and delivery promptness. Will be buying more colors.', rating: 5 },
  { text: 'Good festive wear. If you prefer a loose bust fit, consider sizing up by one size.', rating: 4 },
  { text: 'Wore it to my best friend’s mehendi. The bright shades popped wonderfully in pictures.', rating: 5 },
  { text: 'Fabric is lightweight and soft. No discomfort even in warm weather.', rating: 5 },
  { text: 'The border detailing on sleeves and daman is so neat. Great value for money.', rating: 5 },
  { text: 'Everything from fabric to stitch is premium. Very happy customer!', rating: 5 },
  { text: 'Decent daily/festive wear suit. Color is exact same as photo on site.', rating: 4 },
  { text: 'The flare is voluminous and looks lovely while twirling! Wonderful quality.', rating: 5 }
];

/** Simple deterministic string hash to seed pseudo-random review properties */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Generates 40+ unique, non-repeating customer reviews for a given product.
 * - Names never repeat within the same product.
 * - Comments are uniquely selected.
 * - Star ratings and counts vary naturally across products (between 41 and 55 reviews).
 */
export function generateSeedReviewsForProduct(productId: string, productName = 'Suit Aura Style'): Review[] {
  const seed = hashString(productId || 'product');
  // Review count varies uniquely per product between 41 and 54
  const count = 41 + (seed % 14);

  // Shuffle names deterministically for this product so no name repeats
  const shuffledNames = [...INDIAN_CUSTOMER_NAMES];
  for (let i = shuffledNames.length - 1; i > 0; i--) {
    const j = (seed * (i + 13) + 7) % (i + 1);
    [shuffledNames[i], shuffledNames[j]] = [shuffledNames[j], shuffledNames[i]];
  }

  // Shuffle comments deterministically
  const shuffledComments = [...REVIEW_COMMENTS];
  for (let i = shuffledComments.length - 1; i > 0; i--) {
    const j = (seed * (i + 23) + 11) % (i + 1);
    [shuffledComments[i], shuffledComments[j]] = [shuffledComments[j], shuffledComments[i]];
  }

  const reviews: Review[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let idx = 0; idx < count; idx++) {
    const name = shuffledNames[idx % shuffledNames.length];
    const commentItem = shuffledComments[idx % shuffledComments.length];
    const city = CITIES[(seed + idx * 3) % CITIES.length];
    const size = SIZES[(seed + idx * 5) % SIZES.length];

    // Dates staggered across the past 280 days
    const daysAgo = Math.floor(2 + (idx * 6.2) + ((seed + idx) % 5));
    const reviewDate = new Date(now - daysAgo * dayMs);
    const dateStr = reviewDate.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    reviews.push({
      id: `rev-${productId}-${idx + 1}`,
      productId: String(productId),
      productName,
      userName: name,
      rating: commentItem.rating,
      comment: commentItem.text,
      date: dateStr,
      verifiedPurchase: true,
      sizePurchased: size,
      location: city,
      status: 'approved'
    });
  }

  return reviews;
}

/** Cache map to avoid recalculating reviews repeatedly */
const reviewCache = new Map<string, Review[]>();

export function getProductSeedReviews(productId: string, productName?: string): Review[] {
  if (!productId) return [];
  const key = String(productId);
  if (!reviewCache.has(key)) {
    reviewCache.set(key, generateSeedReviewsForProduct(key, productName));
  }
  return reviewCache.get(key) || [];
}
