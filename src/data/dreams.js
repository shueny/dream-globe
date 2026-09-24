/**
 * Sample dream data.
 *
 * This is the ONE place the data source lives: swapping it for a Supabase query
 * later should touch only this file. Shape per the public API:
 *   { lat, lng, name, age, city, country, text, tier, ago }
 */
export const dreams = [
  { lat: -1.286, lng: 36.817, name: "Aïsha", age: 24, city: "Nairobi", country: "Kenya", text: "Build a rooftop observatory so kids in Kibera can name their own stars.", tier: "STARDUST", ago: "2d ago" },
  { lat: 40.713, lng: -74.006, name: "Marcus", age: 31, city: "New York", country: "USA", text: "Open a 24-hour bookstore where anyone can sleep among the shelves.", tier: "DRIFTER", ago: "5h ago" },
  { lat: 35.689, lng: 139.692, name: "Yuki", age: 19, city: "Tokyo", country: "Japan", text: "Design a train that only stops in towns nobody visits anymore.", tier: "STARDUST", ago: "1d ago" },
  { lat: 48.857, lng: 2.352, name: "Camille", age: 27, city: "Paris", country: "France", text: "Teach my grandmother to paint the sea before her eyes go.", tier: "DRIFTER", ago: "3d ago" },
  { lat: -33.869, lng: 151.209, name: "Noah", age: 22, city: "Sydney", country: "Australia", text: "Swim every coastline of this continent, one summer at a time.", tier: "VOYAGER", ago: "8h ago" },
  { lat: -23.551, lng: -46.633, name: "Lucía", age: 29, city: "São Paulo", country: "Brazil", text: "Turn the empty lot behind my street into a forest.", tier: "STARDUST", ago: "6d ago" },
  { lat: 55.755, lng: 37.617, name: "Dmitri", age: 34, city: "Moscow", country: "Russia", text: "Record the sound of every river before winter locks them.", tier: "DRIFTER", ago: "12h ago" },
  { lat: 28.613, lng: 77.209, name: "Priya", age: 26, city: "New Delhi", country: "India", text: "Cook one free meal a day for a stranger until I am old.", tier: "VOYAGER", ago: "4d ago" },
  { lat: 37.774, lng: -122.419, name: "Theo", age: 23, city: "San Francisco", country: "USA", text: "Ship a tiny app that makes one lonely person feel seen.", tier: "STARDUST", ago: "1h ago" },
  { lat: 30.044, lng: 31.236, name: "Salma", age: 28, city: "Cairo", country: "Egypt", text: "Read every letter my great-grandfather never sent.", tier: "DRIFTER", ago: "9d ago" },
  { lat: 51.507, lng: -0.128, name: "Oliver", age: 33, city: "London", country: "UK", text: "Score a film for a director who does not exist yet.", tier: "VOYAGER", ago: "2d ago" },
  { lat: -34.604, lng: -58.382, name: "Mateo", age: 21, city: "Buenos Aires", country: "Argentina", text: "Dance the last tango in a bar that is about to close forever.", tier: "STARDUST", ago: "7h ago" },
  { lat: 25.033, lng: 121.565, name: "Mei", age: 25, city: "Taipei", country: "Taiwan", text: "Open a night-market stall that serves my grandmother's recipes to travellers.", tier: "VOYAGER", ago: "3h ago" },
  { lat: 22.627, lng: 120.301, name: "Kai", age: 30, city: "Kaohsiung", country: "Taiwan", text: "Sail around the island once, with no engine and no schedule.", tier: "DRIFTER", ago: "1d ago" },
  { lat: 37.567, lng: 126.978, name: "Ji-woo", age: 24, city: "Seoul", country: "South Korea", text: "Write a webtoon my little brother reads on the way to school.", tier: "STARDUST", ago: "6h ago" },
  { lat: 1.352, lng: 103.82, name: "Arjun", age: 29, city: "Singapore", country: "Singapore", text: "Grow a vertical farm on every HDB rooftop in my estate.", tier: "VOYAGER", ago: "2d ago" },
  { lat: 13.756, lng: 100.502, name: "Nok", age: 22, city: "Bangkok", country: "Thailand", text: "Teach the canal boats to run on sunlight.", tier: "DRIFTER", ago: "10h ago" },
  { lat: 19.076, lng: 72.878, name: "Kabir", age: 27, city: "Mumbai", country: "India", text: "Build a cinema for the monsoon — open-air, but dry.", tier: "STARDUST", ago: "5d ago" },
  { lat: 25.205, lng: 55.271, name: "Layla", age: 32, city: "Dubai", country: "UAE", text: "Plant a date grove where the desert meets the sea.", tier: "VOYAGER", ago: "1d ago" },
  { lat: 41.008, lng: 28.978, name: "Emre", age: 26, city: "Istanbul", country: "Türkiye", text: "Ferry a piano across the Bosphorus and play it mid-strait.", tier: "DRIFTER", ago: "14h ago" },
  { lat: 52.52, lng: 13.405, name: "Lena", age: 28, city: "Berlin", country: "Germany", text: "Turn an old U-Bahn tunnel into a library that never closes.", tier: "STARDUST", ago: "3d ago" },
  { lat: 41.385, lng: 2.173, name: "Pau", age: 24, city: "Barcelona", country: "Spain", text: "Finish a building the way Gaudí would have, one tile a day.", tier: "DRIFTER", ago: "4h ago" },
  { lat: 59.329, lng: 18.068, name: "Astrid", age: 35, city: "Stockholm", country: "Sweden", text: "Spend a winter as the only lighthouse keeper in the archipelago.", tier: "VOYAGER", ago: "7d ago" },
  { lat: 64.147, lng: -21.94, name: "Sigrún", age: 23, city: "Reykjavík", country: "Iceland", text: "Photograph the aurora from every fjord on the island.", tier: "STARDUST", ago: "2d ago" },
  { lat: 38.722, lng: -9.139, name: "Inês", age: 30, city: "Lisbon", country: "Portugal", text: "Sing fado on a tram that loops the city all night.", tier: "DRIFTER", ago: "11h ago" },
  { lat: 6.524, lng: 3.379, name: "Tunde", age: 27, city: "Lagos", country: "Nigeria", text: "Build a recording studio that pays every young artist who walks in.", tier: "VOYAGER", ago: "6h ago" },
  { lat: -33.925, lng: 18.424, name: "Thandi", age: 31, city: "Cape Town", country: "South Africa", text: "Hike from Table Mountain to Cairo and write a song in every country.", tier: "STARDUST", ago: "3d ago" },
  { lat: 33.573, lng: -7.59, name: "Youssef", age: 25, city: "Casablanca", country: "Morocco", text: "Restore my grandfather's riad and fill it with travelling musicians.", tier: "DRIFTER", ago: "2d ago" },
  { lat: 19.433, lng: -99.133, name: "Valeria", age: 26, city: "Mexico City", country: "Mexico", text: "Paint a mural so big you can see it from the plane.", tier: "VOYAGER", ago: "9h ago" },
  { lat: 4.711, lng: -74.072, name: "Andrés", age: 28, city: "Bogotá", country: "Colombia", text: "Plant a coffee farm that pays its pickers like engineers.", tier: "STARDUST", ago: "1d ago" },
  { lat: -12.046, lng: -77.043, name: "Rosa", age: 33, city: "Lima", country: "Peru", text: "Cook ceviche at the top of Machu Picchu for strangers.", tier: "DRIFTER", ago: "4d ago" },
  { lat: -33.449, lng: -70.669, name: "Tomás", age: 22, city: "Santiago", country: "Chile", text: "Build a telescope in the Atacama that anyone can book for free.", tier: "VOYAGER", ago: "13h ago" },
  { lat: 43.653, lng: -79.383, name: "Chloe", age: 29, city: "Toronto", country: "Canada", text: "Canoe from Lake Ontario to the Arctic Ocean.", tier: "STARDUST", ago: "5h ago" },
  { lat: 49.283, lng: -123.121, name: "Ethan", age: 34, city: "Vancouver", country: "Canada", text: "Teach my daughter to surf in winter, just once.", tier: "DRIFTER", ago: "2d ago" },
  { lat: 41.878, lng: -87.63, name: "Jada", age: 24, city: "Chicago", country: "USA", text: "Open a jazz club where the cover charge is a story.", tier: "VOYAGER", ago: "8h ago" },
  { lat: 29.76, lng: -95.37, name: "Diego", age: 27, city: "Houston", country: "USA", text: "Become the first person from my street to walk on the Moon.", tier: "STARDUST", ago: "20h ago" },
  { lat: 21.307, lng: -157.858, name: "Leilani", age: 26, city: "Honolulu", country: "USA", text: "Navigate a voyaging canoe to Tahiti by the stars alone.", tier: "VOYAGER", ago: "3d ago" },
  { lat: -36.848, lng: 174.763, name: "Aroha", age: 28, city: "Auckland", country: "New Zealand", text: "Record every elder in my iwi telling their favourite story.", tier: "DRIFTER", ago: "1d ago" },
  { lat: -37.814, lng: 144.963, name: "Sam", age: 23, city: "Melbourne", country: "Australia", text: "Run a café where every cup is paid forward.", tier: "STARDUST", ago: "6h ago" },
  { lat: 14.6, lng: 120.984, name: "Paolo", age: 25, city: "Manila", country: "Philippines", text: "Build a floating school for island kids during typhoon season.", tier: "VOYAGER", ago: "4d ago" },
  { lat: -6.208, lng: 106.846, name: "Sari", age: 27, city: "Jakarta", country: "Indonesia", text: "Clean one river until the fish come back.", tier: "DRIFTER", ago: "2d ago" },
  { lat: 31.23, lng: 121.474, name: "Lin", age: 30, city: "Shanghai", country: "China", text: "Teach my parents to video-call me from a mountain top.", tier: "STARDUST", ago: "15h ago" },
  { lat: 34.694, lng: 135.502, name: "Haruto", age: 21, city: "Osaka", country: "Japan", text: "Make the perfect takoyaki and open a stand in Paris.", tier: "DRIFTER", ago: "3d ago" },
  { lat: 43.062, lng: 141.354, name: "Aoi", age: 26, city: "Sapporo", country: "Japan", text: "Build a snow hotel that melts into a garden every spring.", tier: "VOYAGER", ago: "6d ago" },
  { lat: 35.689, lng: 51.389, name: "Darya", age: 29, city: "Tehran", country: "Iran", text: "Translate my favourite poets into a language with no written form.", tier: "STARDUST", ago: "2d ago" },
  { lat: 9.03, lng: 38.74, name: "Selam", age: 24, city: "Addis Ababa", country: "Ethiopia", text: "Roast coffee for the whole neighbourhood every Sunday, forever.", tier: "DRIFTER", ago: "1d ago" },
  { lat: -89.99, lng: 139.27, name: "Ingrid", age: 37, city: "South Pole Station", country: "Antarctica", text: "Winter over and watch the sun come back after four months.", tier: "VOYAGER", ago: "12d ago" },
];

/**
 * Index pairs into `dreams` that get connected by animated arcs.
 */
export const arcPairs = [
  [0, 7], [0, 3], [1, 8], [2, 4], [5, 1], [3, 10], [7, 4], [6, 2], [9, 10],
  [12, 2], [12, 15], [14, 12], [16, 15], [18, 7], [19, 20], [25, 26], [28, 1],
  [29, 31], [32, 34], [36, 37], [38, 4], [39, 12], [41, 12], [45, 0],
];
