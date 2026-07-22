/**
 * Sample dream data — the prototype's inline 12.
 *
 * This is the ONE place the data source lives: swapping it for a Supabase query
 * later should touch only this file (brief §9). Shape per the public API:
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
];

/**
 * Index pairs into `dreams` that get connected by animated arcs (prototype's set).
 */
export const arcPairs = [
  [0, 7], [0, 3], [1, 8], [2, 4], [5, 1], [3, 10], [7, 4], [6, 2], [9, 10],
];
