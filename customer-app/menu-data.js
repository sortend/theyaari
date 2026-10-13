// Shahi Darbar Restaurant — Real Menu Data
const MENU = {
  restaurant: {
    name: "Shahi Darbar",
    tagline: "Food that feels like Royalty",
    address: "Simrahi Partabganj Road, NH 27, Shahi Darbar",
    phone: "9162465392",
    whatsapp: "9102209387"
  },
  categories: [
    {
      id: "tea",
      label: "Tea & Coffee",
      icon: "☕",
      items: [
        { name: "Milk Tea", price: 35, veg: true, emoji: "🍵" },
        { name: "Black Tea", price: 25, veg: true, emoji: "🍵" },
        { name: "Green Tea", price: 30, veg: true, emoji: "🍵" },
        { name: "Hot Coffee", price: 45, veg: true, emoji: "☕" },
        { name: "Black Coffee", price: 30, veg: true, emoji: "☕" },
        { name: "Cold Coffee", price: 120, veg: true, emoji: "🥤" }
      ]
    },
    {
      id: "starters-nonveg",
      label: "Starters (Non Veg)",
      icon: "🍗",
      items: [
        { name: "Chicken Chilli Bone", price: 240, veg: false, emoji: "🍗" },
        { name: "Chicken Chilli Boneless", price: 290, veg: false, emoji: "🍗" },
        { name: "Chicken Pakora", price: 255, veg: false, emoji: "🍗" },
        { name: "Egg Pakora", price: 160, veg: false, emoji: "🥚" },
        { name: "Chicken 65", price: 305, veg: false, emoji: "🍗" },
        { name: "Chicken Lolipop", price: 280, veg: false, emoji: "🍗" },
        { name: "Chicken Hakka Noodles", price: 199, veg: false, emoji: "🍜" },
        { name: "Chicken Manchurian", price: 280, veg: false, emoji: "🍗" }
      ]
    },
    {
      id: "starters-veg",
      label: "Starters (Veg)",
      icon: "🥦",
      items: [
        { name: "Veg Pakora", price: 180, veg: true, emoji: "🥦" },
        { name: "Onion Pakora", price: 170, veg: true, emoji: "🧅" },
        { name: "Paneer Pakora", price: 200, veg: true, emoji: "🧀" },
        { name: "Paneer Chilli", price: 280, veg: true, emoji: "🧀" },
        { name: "Veg Hakka Noodles", price: 180, veg: true, emoji: "🍜" },
        { name: "Baby Corn Chilli", price: 220, veg: true, emoji: "🌽" },
        { name: "Crispy Baby Corn", price: 210, veg: true, emoji: "🌽" },
        { name: "Mushroom Chilli", price: 260, veg: true, emoji: "🍄" },
        { name: "Paneer 65", price: 260, veg: true, emoji: "🧀" },
        { name: "Veg Manchurian", price: 260, veg: true, emoji: "🥗" },
        { name: "Paneer Manchurian", price: 230, veg: true, emoji: "🧀" }
      ]
    },
    {
      id: "main-veg",
      label: "Main Course (Veg)",
      icon: "🍛",
      items: [
        { name: "Shahi Paneer (Sweet)", price: 255, veg: true, emoji: "🍛" },
        { name: "Paneer Do Pyaza", price: 260, veg: true, emoji: "🍛" },
        { name: "Paneer Handi", price: 270, veg: true, emoji: "🍛" },
        { name: "Paneer Chatpata", price: 290, veg: true, emoji: "🍛" },
        { name: "Paneer Dilruba", price: 305, veg: true, emoji: "🍛" },
        { name: "Paneer Masala", price: 230, veg: true, emoji: "🍛" },
        { name: "Plain Dal", price: 130, veg: true, emoji: "🥣" },
        { name: "Dal Fry", price: 140, veg: true, emoji: "🥣" },
        { name: "Butter Dal Tadka", price: 170, veg: true, emoji: "🥣" },
        { name: "Panjabi Dal Tadka", price: 190, veg: true, emoji: "🥣" },
        { name: "Dal Tadka", price: 150, veg: true, emoji: "🥣" }
      ]
    },
    {
      id: "main-nonveg",
      label: "Main Course (Non-Veg)",
      icon: "🍖",
      items: [
        { name: "Chicken Do Pyaza", price: 360, veg: false, emoji: "🍖" },
        { name: "Chicken Kadhai", price: 400, priceFull: 700, veg: false, emoji: "🍖" },
        { name: "Chicken Butter Masala", price: 450, priceFull: 750, veg: false, emoji: "🍖" },
        { name: "Chicken Dehati", price: 460, priceFull: 850, veg: false, emoji: "🍖" },
        { name: "Chicken Curry", price: 350, priceFull: 650, veg: false, emoji: "🍖" },
        { name: "Chicken Sabnam", price: 480, priceFull: 850, veg: false, emoji: "🍖" },
        { name: "Shahi Chicken", price: 550, priceFull: 900, veg: false, emoji: "🍖" },
        { name: "Chicken Kassa", price: 400, priceFull: 770, veg: false, emoji: "🍖" },
        { name: "Egg Curry", price: 190, veg: false, emoji: "🥚" },
        { name: "Mutton Do Pyaza", price: 460, veg: false, emoji: "🍖" },
        { name: "Mutton Curry", price: 450, veg: false, emoji: "🍖" },
        { name: "Mutton Dehati", price: 360, priceFull: 450, veg: false, emoji: "🍖" }
      ]
    },
    {
      id: "rice",
      label: "Rice",
      icon: "🍚",
      items: [
        { name: "Steam Rice", price: 120, veg: true, emoji: "🍚" },
        { name: "Veg Briyani", price: 210, veg: true, emoji: "🍚" },
        { name: "Chicken Hyderabadi Briyani", price: 260, veg: false, emoji: "🍛" },
        { name: "Mutton Briyani", price: 320, veg: false, emoji: "🍛" },
        { name: "Paneer Briyani", price: 225, veg: true, emoji: "🍚" },
        { name: "Egg Briyani", price: 190, veg: false, emoji: "🍚" }
      ]
    },
    {
      id: "thali",
      label: "Thali",
      icon: "🍽️",
      items: [
        { name: "Veg Thali", price: 450, veg: true, emoji: "🍽️" },
        { name: "Non Veg Thali", price: 550, veg: false, emoji: "🍽️" },
        { name: "Shahi Darbar Special Thali", price: 700, veg: false, emoji: "👑" }
      ]
    }
  ]
};
