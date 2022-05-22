const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5001;

app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.h2hlx.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorize" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next(); // for got
  });
};
async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db("doctor_portal").collection("services");
    const bookingCollection = client.db("doctor_portal").collection("bookings");
    const usersCollection = client.db("doctor_portal").collection("users");

    app.get("/users", verifyJWT, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";

      res.send({ admin: isAdmin });
    });

    app.get("/services", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    });

    //make user role
    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await usersCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };

        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    });

    //make a user role  and give access token for login and other auth
    app.put("/user/:email", async (req, res) => {
      const user = req.body;
      console.log(user);
      const email = req.params.email;
      console.log(email);
      const filter = { email: email };
      const options = { upsert: true };

      const updateDoc = {
        $set: user,
      };

      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      console.log(result);

      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ result, accessToken: token });
    });

    // this is not the proper way to querry
    // after learning more about mongodb. use aggregate lookup, pipeline, match, group
    app.get("/available", async (req, res) => {
      const date = req.query.date || "May 20, 2022";

      //step 1: get all service
      const services = await serviceCollection.find().toArray();

      //step 2: get the booking that day
      const query = { date: date };
      const booking = await bookingCollection.find(query).toArray();

      //step 3: for each service,
      services.forEach((service) => {
        //step 4: find booking for that service [{},{},{},{},{},{}]
        const serviceBooking = booking.filter(
          (book) => book.treatment === service.name
        );
        // step 5: select slots for the service booking: ['','','','']
        const booked = serviceBooking.map((book) => book.slot);
        // step 6: select those slots that are not in bookedSlots
        const available = service.slots.filter(
          (slot) => !booked.includes(slot)
        );
        // step 7: set available to slots to make it easier
        service.slots = available;
      });

      res.send(services);
    });

    // app.get("/available", async (req, res) => {
    //   const date = req.query.date || "May 19, 2022";

    //   // step 1
    //   const services = await serviceCollection.find().toArray();

    //   // step 2
    //   const query = { date: date };
    //   const bookings = await bookingCollection.find(query).toArray();

    //   // step 3 for each services find booking

    //   services.forEach((service) => {
    //     const serviceBooking = bookings.filter(
    //       (b) => b.treatment === service.name
    //     );
    //     // const booked = serviceBooking.map((s) => s.slot);
    //     // service.booked = booked;

    //     service.booked = serviceBooking.map((s) => s.slot);
    //   });

    //   res.send(services);
    // });
    /**
     * API Naming Convention
     * app.get('/booking') // get all booking in this collection. or get more then one or by filter
     * app.get('/booking/:id') // get a specific booking
     * app.post('booking') // add a new booking
     * app.patch('booking/:id')
     * app.put('booking/:id')
     * app.delete('booking/:id')
     *
     */

    // get data
    app.get("/booking", verifyJWT, async (req, res) => {
      const patientEmail = req.query.patientEmail;
      const authorization = req.headers.authorization;
      const decodedEmail = req.decoded.email;
      if (patientEmail === decodedEmail) {
        const query = { patientEmail: patientEmail };
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings);
      } else {
        return res.status(403).send({ message: "forbidden access" });
      }
    });

    // insert data
    app.post("/booking", async (req, res) => {
      const booking = req.body; //recive data from client
      console.log("receive data from client", booking);

      const query = {
        treatment: booking.treatment,
        date: booking.date,
        slot: booking.slot,
        patientName: booking.patientName,
      };
      const exists = await bookingCollection.findOne(query);
      console.log("exists: ", exists);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      res.send({ success: true, result });
    });
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome from Doctors Portal");
});

app.listen(port, () => {
  console.log(`Doctor listening on port ${port}`);
});
