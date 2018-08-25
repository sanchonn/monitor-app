var animal = {
  eats: true
};

var rabbit = {
  jumps: true,
  __proto__: animal
};

for (var key in rabbit) {
  console.log(key + " = " + rabbit[key], ' ', rabbit.hasOwnProperty(key)); // выводит и "eats" и "jumps"
}

Object.keys(rabbit).forEach((key) => {
  console.log(key + " = " + rabbit[key]);
});