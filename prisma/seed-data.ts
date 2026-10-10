/** Static catalogue and name data for the demo seed (Pakistani menswear store). */

export const CITIES: [string, number][] = [
  ["Lahore", 26],
  ["Karachi", 24],
  ["Islamabad", 13],
  ["Rawalpindi", 10],
  ["Faisalabad", 8],
  ["Multan", 7],
  ["Peshawar", 6],
  ["Gujranwala", 6],
];

export const FIRST_NAMES = [
  "Muhammad", "Ahmed", "Usman", "Bilal", "Hamza", "Fahad", "Saad", "Zain", "Hassan", "Ali", "Umer", "Asad", "Talha", "Danish",
  "Kashif", "Imran", "Waqas", "Shahzaib", "Junaid", "Faisal", "Noman", "Adeel", "Haris", "Moiz", "Rehan", "Taimoor", "Arsalan",
  "Sohail", "Zeeshan", "Owais", "Ayesha", "Fatima", "Sana", "Hira", "Mahnoor", "Zainab", "Amna", "Maryam",
];
export const LAST_NAMES = [
  "Ali", "Khan", "Tariq", "Ahmed", "Iqbal", "Malik", "Hussain", "Abbas", "Raza", "Haider", "Farooq", "Mehmood", "Siddiqui",
  "Qureshi", "Javed", "Shah", "Butt", "Akhtar", "Anwar", "Chaudhry", "Rashid", "Sheikh", "Mirza", "Baig", "Aslam", "Khalid", "Nawaz",
];

export const STREETS = ["Main Boulevard", "Canal Road", "Jinnah Avenue", "MM Alam Road", "Shahrah-e-Faisal", "University Road", "GT Road", "Service Road", "Ferozepur Road", "Murree Road"];
export const AREAS: Record<string, string[]> = {
  Lahore: ["DHA Phase 5", "Gulberg III", "Johar Town", "Model Town", "Bahria Town", "Wapda Town"],
  Karachi: ["Clifton Block 5", "DHA Phase 6", "Gulshan-e-Iqbal", "North Nazimabad", "PECHS", "Bahadurabad"],
  Islamabad: ["F-7/2", "G-11/3", "E-11", "I-8/4", "Bahria Enclave", "DHA Phase 2"],
  Rawalpindi: ["Satellite Town", "Bahria Town Phase 7", "Saddar", "Chaklala Scheme 3", "Westridge"],
  Faisalabad: ["Madina Town", "Peoples Colony", "D Ground", "Canal Road"],
  Multan: ["Gulgasht Colony", "Cantt", "Shah Rukn-e-Alam"],
  Peshawar: ["Hayatabad Phase 3", "University Town", "Saddar"],
  Gujranwala: ["Satellite Town", "Model Town", "DC Colony"],
};

export const COLORS: Record<string, string> = {
  Black: "#111827",
  White: "#f8fafc",
  Navy: "#1e2a4a",
  Maroon: "#6b1d2a",
  Olive: "#556b2f",
  "Sky Blue": "#7fb3e0",
  Pink: "#f2b8c6",
  Grey: "#8b929c",
  Khaki: "#c3b091",
  Charcoal: "#36393f",
  Beige: "#d9c7a7",
  Red: "#b91c1c",
  Blue: "#2f5d9e",
  Brown: "#6f4a2f",
  Camel: "#b88a56",
  Cream: "#efe6d2",
  "Off White": "#efece4",
};

export type ProductSeed = {
  title: string;
  category: "shirts" | "trousers" | "tracksuits" | "sweatshirts" | "winter-collection" | "other";
  shape: "shirt" | "polo" | "trouser" | "tracksuit" | "hoodie" | "sweatshirt" | "jacket" | "coat" | "sweater" | "accessory";
  color: string;
  price: number; // PKR major units
  compareAt?: number;
  sizes: string[];
  popularity: number; // relative demand weight
  trend?: number; // >1 = accelerating recently
  tags: string[];
};

const SHIRT = ["S", "M", "L", "XL", "XXL"];
const TROUSER = ["30", "32", "34", "36", "38"];
const ONE = ["One Size"];

export const PRODUCTS: ProductSeed[] = [
  { title: "Premium Black Shirt", category: "shirts", shape: "shirt", color: "Black", price: 3990, sizes: SHIRT, popularity: 10, trend: 1.35, tags: ["premium", "bestseller", "cotton"] },
  { title: "Premium White Shirt", category: "shirts", shape: "shirt", color: "White", price: 3990, sizes: SHIRT, popularity: 8, tags: ["premium", "cotton"] },
  { title: "Premium Navy Shirt", category: "shirts", shape: "shirt", color: "Navy", price: 3990, sizes: SHIRT, popularity: 6, tags: ["premium", "cotton"] },
  { title: "Premium Maroon Shirt", category: "shirts", shape: "shirt", color: "Maroon", price: 3990, compareAt: 4490, sizes: SHIRT, popularity: 4, tags: ["premium"] },
  { title: "Premium Olive Shirt", category: "shirts", shape: "shirt", color: "Olive", price: 3990, sizes: SHIRT, popularity: 3, tags: ["premium"] },
  { title: "Oxford Shirt — Sky Blue", category: "shirts", shape: "shirt", color: "Sky Blue", price: 3290, sizes: SHIRT, popularity: 7, tags: ["oxford", "formal"] },
  { title: "Oxford Shirt — White", category: "shirts", shape: "shirt", color: "White", price: 3290, sizes: SHIRT, popularity: 6, tags: ["oxford", "formal"] },
  { title: "Oxford Shirt — Pink", category: "shirts", shape: "shirt", color: "Pink", price: 3290, sizes: SHIRT, popularity: 3, tags: ["oxford"] },
  { title: "Oxford Shirt — Grey", category: "shirts", shape: "shirt", color: "Grey", price: 3290, sizes: SHIRT, popularity: 3, tags: ["oxford"] },
  { title: "Oxford Button-Down — Navy", category: "shirts", shape: "shirt", color: "Navy", price: 3490, sizes: SHIRT, popularity: 4, tags: ["oxford"] },
  { title: "Classic Polo — Black", category: "shirts", shape: "polo", color: "Black", price: 2490, sizes: SHIRT, popularity: 6, tags: ["polo"] },
  { title: "Classic Polo — White", category: "shirts", shape: "polo", color: "White", price: 2490, sizes: SHIRT, popularity: 5, tags: ["polo"] },
  { title: "Classic Polo — Navy", category: "shirts", shape: "polo", color: "Navy", price: 2490, sizes: SHIRT, popularity: 4, tags: ["polo"] },
  { title: "Pique Polo — Maroon", category: "shirts", shape: "polo", color: "Maroon", price: 2790, sizes: SHIRT, popularity: 2, tags: ["polo"] },
  { title: "Pique Polo — Olive", category: "shirts", shape: "polo", color: "Olive", price: 2790, sizes: SHIRT, popularity: 2, tags: ["polo"] },
  { title: "Striped Polo — Navy White", category: "shirts", shape: "polo", color: "Navy", price: 2990, compareAt: 3490, sizes: SHIRT, popularity: 2, tags: ["polo", "sale"] },
  { title: "Black Formal Trousers", category: "trousers", shape: "trouser", color: "Black", price: 3490, sizes: TROUSER, popularity: 7, tags: ["formal"] },
  { title: "Charcoal Formal Trousers", category: "trousers", shape: "trouser", color: "Charcoal", price: 3490, sizes: TROUSER, popularity: 4, tags: ["formal"] },
  { title: "Navy Formal Trousers", category: "trousers", shape: "trouser", color: "Navy", price: 3490, sizes: TROUSER, popularity: 3, tags: ["formal"] },
  { title: "Casual Chino — Khaki", category: "trousers", shape: "trouser", color: "Khaki", price: 3290, sizes: TROUSER, popularity: 5, tags: ["casual", "chino"] },
  { title: "Casual Chino — Olive", category: "trousers", shape: "trouser", color: "Olive", price: 3290, sizes: TROUSER, popularity: 3, tags: ["casual", "chino"] },
  { title: "Casual Chino — Navy", category: "trousers", shape: "trouser", color: "Navy", price: 3290, sizes: TROUSER, popularity: 3, tags: ["casual", "chino"] },
  { title: "Cargo Trousers — Black", category: "trousers", shape: "trouser", color: "Black", price: 3790, sizes: TROUSER, popularity: 4, trend: 1.2, tags: ["cargo"] },
  { title: "Cargo Trousers — Olive", category: "trousers", shape: "trouser", color: "Olive", price: 3790, sizes: TROUSER, popularity: 2, tags: ["cargo"] },
  { title: "Slim Fit Chino — Beige", category: "trousers", shape: "trouser", color: "Beige", price: 3290, sizes: TROUSER, popularity: 2, tags: ["chino"] },
  { title: "Black Tracksuit", category: "tracksuits", shape: "tracksuit", color: "Black", price: 6490, sizes: SHIRT, popularity: 8, trend: 2.4, tags: ["tracksuit", "winter"] },
  { title: "Navy Tracksuit", category: "tracksuits", shape: "tracksuit", color: "Navy", price: 6490, sizes: SHIRT, popularity: 4, trend: 1.6, tags: ["tracksuit"] },
  { title: "Grey Tracksuit", category: "tracksuits", shape: "tracksuit", color: "Grey", price: 6490, sizes: SHIRT, popularity: 3, trend: 1.5, tags: ["tracksuit"] },
  { title: "Fleece Tracksuit — Charcoal", category: "tracksuits", shape: "tracksuit", color: "Charcoal", price: 6990, sizes: SHIRT, popularity: 3, trend: 1.8, tags: ["tracksuit", "fleece", "winter"] },
  { title: "Sports Tracksuit — Black Red", category: "tracksuits", shape: "tracksuit", color: "Red", price: 5990, sizes: SHIRT, popularity: 2, tags: ["tracksuit", "sports"] },
  { title: "Velour Tracksuit — Maroon", category: "tracksuits", shape: "tracksuit", color: "Maroon", price: 7490, sizes: SHIRT, popularity: 1, tags: ["tracksuit"] },
  { title: "Crew Neck Sweatshirt — Black", category: "sweatshirts", shape: "sweatshirt", color: "Black", price: 3490, sizes: SHIRT, popularity: 5, trend: 1.4, tags: ["sweatshirt", "winter"] },
  { title: "Crew Neck Sweatshirt — Grey", category: "sweatshirts", shape: "sweatshirt", color: "Grey", price: 3490, sizes: SHIRT, popularity: 4, trend: 1.3, tags: ["sweatshirt"] },
  { title: "Crew Neck Sweatshirt — Navy", category: "sweatshirts", shape: "sweatshirt", color: "Navy", price: 3490, sizes: SHIRT, popularity: 3, tags: ["sweatshirt"] },
  { title: "Hooded Sweatshirt — Black", category: "sweatshirts", shape: "hoodie", color: "Black", price: 4490, sizes: SHIRT, popularity: 5, trend: 1.5, tags: ["hoodie", "winter"] },
  { title: "Hooded Sweatshirt — Olive", category: "sweatshirts", shape: "hoodie", color: "Olive", price: 4490, sizes: SHIRT, popularity: 2, tags: ["hoodie"] },
  { title: "Zipper Hoodie — Charcoal", category: "sweatshirts", shape: "hoodie", color: "Charcoal", price: 4790, sizes: SHIRT, popularity: 2, tags: ["hoodie"] },
  { title: "Graphic Sweatshirt — Off White", category: "sweatshirts", shape: "sweatshirt", color: "Off White", price: 3790, sizes: SHIRT, popularity: 1, tags: ["sweatshirt", "graphic"] },
  { title: "Puffer Jacket — Black", category: "winter-collection", shape: "jacket", color: "Black", price: 9990, sizes: SHIRT, popularity: 5, trend: 2.0, tags: ["jacket", "winter", "puffer"] },
  { title: "Puffer Jacket — Olive", category: "winter-collection", shape: "jacket", color: "Olive", price: 9990, sizes: SHIRT, popularity: 2, trend: 1.8, tags: ["jacket", "winter", "puffer"] },
  { title: "Bomber Jacket — Navy", category: "winter-collection", shape: "jacket", color: "Navy", price: 7990, sizes: SHIRT, popularity: 3, trend: 1.5, tags: ["jacket", "winter"] },
  { title: "Denim Jacket — Blue", category: "winter-collection", shape: "jacket", color: "Blue", price: 6990, sizes: SHIRT, popularity: 2, tags: ["jacket", "denim"] },
  { title: "Leather Jacket — Brown", category: "winter-collection", shape: "jacket", color: "Brown", price: 18990, sizes: SHIRT, popularity: 1, trend: 1.6, tags: ["jacket", "leather", "winter"] },
  { title: "Quilted Gilet — Black", category: "winter-collection", shape: "jacket", color: "Black", price: 6490, sizes: SHIRT, popularity: 1, tags: ["gilet", "winter"] },
  { title: "Wool Blend Coat — Camel", category: "winter-collection", shape: "coat", color: "Camel", price: 14990, sizes: SHIRT, popularity: 1, trend: 1.7, tags: ["coat", "winter"] },
  { title: "Fleece Jacket — Grey", category: "winter-collection", shape: "jacket", color: "Grey", price: 5490, sizes: SHIRT, popularity: 2, trend: 1.6, tags: ["fleece", "winter"] },
  { title: "High Neck Sweater — Charcoal", category: "winter-collection", shape: "sweater", color: "Charcoal", price: 4990, sizes: SHIRT, popularity: 2, trend: 1.7, tags: ["sweater", "winter"] },
  { title: "Cable Knit Sweater — Cream", category: "winter-collection", shape: "sweater", color: "Cream", price: 5490, sizes: SHIRT, popularity: 2, trend: 1.5, tags: ["sweater", "winter"] },
  { title: "Leather Belt — Black", category: "other", shape: "accessory", color: "Black", price: 1990, sizes: ONE, popularity: 3, tags: ["belt", "accessory"] },
  { title: "Leather Belt — Brown", category: "other", shape: "accessory", color: "Brown", price: 1990, sizes: ONE, popularity: 2, tags: ["belt", "accessory"] },
  { title: "Cotton Socks 3-Pack", category: "other", shape: "accessory", color: "Grey", price: 990, sizes: ONE, popularity: 3, tags: ["socks", "accessory"] },
  { title: "Knit Beanie — Black", category: "other", shape: "accessory", color: "Black", price: 1290, sizes: ONE, popularity: 2, trend: 1.8, tags: ["beanie", "winter", "accessory"] },
];

/** Fixed stock for headline variants so the dashboard matches the product story. */
export const FIXED_STOCK: Record<string, Record<string, number>> = {
  "Premium Black Shirt": { S: 8, M: 42, L: 51, XL: 6, XXL: 0 },
  "Black Tracksuit": { S: 14, M: 22, L: 12, XL: 6, XXL: 3 },
  "Puffer Jacket — Black": { S: 4, M: 9, L: 11, XL: 5, XXL: 2 },
};
