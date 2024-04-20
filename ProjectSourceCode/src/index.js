// *****************************************************
// <!-- Section 1 : Import Dependencies -->
// *****************************************************


const express = require('express'); // To build an application server or API
const app = express();
const handlebars = require('express-handlebars');
const Handlebars = require('handlebars');
const path = require('path');
const pgp = require('pg-promise')(); // To connect to the Postgres DB from the node server
const bodyParser = require('body-parser');
const session = require('express-session'); // To set the session object. To store or access session data, use the `req.session`, which is (generally) serialized as JSON by the store.
const bcrypt = require('bcrypt'); //  To hash passwords
const axios = require('axios'); // To make HTTP requests from our server. We'll learn more about it in Part C.
const { start } = require('repl');
const { get } = require('http');

//ask about how to get .env variables when in different directory

app.use('/resources', express.static('resources'));

// *****************************************************
// <!-- Section 2 : Connect to DB -->
// *****************************************************

// create `ExpressHandlebars` instance and configure the layouts and partials dir.
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: __dirname + '/views/layouts',
  partialsDir: __dirname + '/views/partials',
});

//string equality helper for handlebars ifelse
hbs.handlebars.registerHelper('eq', function(a, b, opts) {
  console.log(a, b);
  if (a === b) {
      return opts.fn(this);
  } else {
      return opts.inverse(this);
  }
});

hbs.handlebars.registerHelper('arrayIndex', function (array, index) {
  console.log(array, index);
  var x=Number(index);
  return array[x];
});

hbs.handlebars.registerHelper("setVar", function(varName, varValue, options) {
  options.data.root[varName] = varValue;
});
// database configuration
const dbConfig = {
  host: 'db', // the database server
  port: 5432, // the database port
  database: process.env.POSTGRES_DB, // the database name
  user: process.env.POSTGRES_USER, // the user account to connect with
  password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const db = pgp(dbConfig);

// test your database
db.connect()
  .then(obj => {
    console.log('Database connection successful'); // you can view this message in the docker compose logs
    obj.done(); // success, release the connection;
  })
  .catch(error => {
    console.log('ERROR:', error.message || error);
  });

// *****************************************************
// <!-- Section 3 : App Settings -->
// *****************************************************

// Register `hbs` as our view engine using its bound `engine()` function.
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json()); // specify the usage of JSON for parsing request body.



// initialize session variables
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    resave: false,
  })
);

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);


// *****************************************************
// <!               Login - Amy                   >
// *****************************************************
const user = {
    username: undefined,
    password: undefined,
  };

  app.get('/',(req,res)=>{
    res.redirect('/discover');
  });

  app.get('/login', (req, res) => {
    res.render('pages/login');
  });
  
  app.post('/login', async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
  //console.log(username, password);

    try {
        // Find the user from the database
        const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [username]);
        
        if (user) {
          // Check if the entered password matches the stored hashed pord
          
          const passwordMatch = await bcrypt.compare(password, user.password);
    
          if (passwordMatch) {
            // Save the user in the session variable
            req.session.user = user;
            req.session.save();
    
            // Redirect to /discover route after setting the session
            res.redirect('/discover');
          } else {
            // Incorrect username or password, render login page with error message
            message = `Incorrect username or password.`
            res.render('pages/login', { message });
          }
        } else {
          // User not found in the table
          message = 'User not found! Please check spelling or click below to register.'
          res.render('pages/login', { message });
        }
      } catch (error) {
        console.error(error);
        // Database request fails, send an appropriate message to the user and render the login.hbs page
        message ='An error occurred during login. Please try again.'
        res.render('pages/login', { message });
      }
});


// *****************************************************
// <!               Register - Amy                  >
// *****************************************************
app.get('/register', (req, res) => {
    res.render('pages/register');
  });
  
  app.post('/register', async (req, res) => {
   // console.log("test");
    try {
      const usernameLocal = req.body.username;
      const hash = await bcrypt.hash(req.body.password, 10);
      const email = req.body.email;
  
      // Check if the username already exists in the database
      const userExists = await db.oneOrNone('SELECT username FROM users WHERE username = $1', [usernameLocal]);
      if(!usernameLocal ||!req.body.password){ //if user empty or pass empty
          throw new Error('Username or password is empty');

      }
      if (userExists) {
        // Username already exists, redirect to register page with error message
        throw new Error('Username already exists');
        
        
      }
  
      // Register the user with the provided data
      await db.none('INSERT INTO users(username, password, email) VALUES($1, $2, $3)', [usernameLocal, hash, email]);
     
      //at this point we need to redirect to  login, cause registration was successful. 
      //In order to get unit tests to work, we need to send a redirect, not a render.
      //the problem is, that redirect takes one paramater, so we cnanot send it the mssage.
      //Maybe once we set the session we could do something like:

       //res.session.message = 'Success! Please login with new credentials: '

       //until then,
      res.redirect('/login');  

     // res.render('pages/login', { message: 'Success! Please login with new credentials: ' });
      } catch (error) {

      console.error(error);
      // Handle errors gracefully (e.g., display error message)
      //now alternatively, instead of testing for redirects, we could test for certain keywords in the HTML response.
      //in this case, instead of redurecting to register, we can simply render the page, and in the test check that we rendered the page with <title>Register<title>.
      res.status(400).render('pages/register', { message: 'An error occurred during registration. Please try again.' });
      
     
    }
  });
  
  
// *****************************************************
// <!     Authentication Middleware                   >
// *****************************************************
  //Authentication Middleware
  const auth = (req, res, next) => {
    if (!req.session.user) {
      // Default to login page if not authenticated
      return res.redirect('/login');
    }
    next(); // Allow access if authenticated
  };
  
  app.use(auth);


  
// *****************************************************
// <!          Artworks-Ethan                  >
// *****************************************************

// generate an offset to be used in api calls for artworks
// using 20000 artworks has size>20000
function generateOffsetArtworks() {
  return Math.floor(Math.random() * 20000);
}

// generate an offset to be used in api calls for artworks
// using 200000 ~ 261000 artists available
function generateOffsetArtists() {
  return Math.floor(Math.random() * 200000);
}

// Handlebars.registerHelper('getArtistNameByArtworkId', async function(id) {
//   try { 
//     const config = {
//       headers: {
//         'X-XAPP-Token': process.env.X_XAPP_TOKEN
//       },
//       params: {
//         artwork_id: id
//       }
//     };

//     const artist_obj = await axios.get('https://api.artsy.net/api/artists', config);
    
//     artist = artist_obj.data._embedded.artists

//     return artist;
//   } catch(err) {
//     console.log(err);
//   }
// });

Handlebars.unregisterHelper('getArtistNameByArtworkId');

app.get('/artworks', async (req, res) => {
  //Note: there is around 27000 artworks provided by artsy
  //going to select a sample of around 100 to show
  try {
    const art_offset = generateOffsetArtworks();
    const config = {
      headers: {
        'X-XAPP-Token': process.env.X_XAPP_TOKEN
      },
      params: {
        offset: art_offset,
        size: 36
      }
    }
    const response = await axios.get('https://api.artsy.net/api/artworks', config);
    /* format of response 
    {
      _embedded {
        artworks: [
          list of artworks
        ]
    */
    const artworks = response.data._embedded.artworks;
    res.render('pages/artworks', {artworks});

  } catch(error) {
    console.log(error);

    res.redirect('/discover');
  }
})


// *****************************************************
// <!          Home / Discover-Ethan                  >
// *****************************************************

// handle events api call
function getEvents() {
  //axios.get(url, config *e.g headers and such*)

  const config = {
    headers: {
      'X-XAPP-Token': process.env.X_XAPP_TOKEN
    },
    params: {
      status: 'running_and_upcoming',
      size: 4
    }
  };

  return axios.get('https://api.artsy.net/api/fairs', config)
    .catch(err => {
      console.log(err);
    });
}

// handle artworks api call
function getArtworks() {
  const artworks_offset = generateOffsetArtworks();
  // setup for API call
  const config = {
    headers: {
      'X-XAPP-Token': process.env.X_XAPP_TOKEN
    },
    params: {
      size: 4,
      offset: artworks_offset
    }
}
  //axios.get(url, config *e.g headers and such*)
  return axios.get('https://api.artsy.net/api/artworks', config)
    .catch(err => {
      console.log(err);
    });
}

// handle artists api call
function getArtists() {
  const artist_offset = generateOffsetArtists();

  const config = {
    headers: {
      'X-XAPP-Token': process.env.X_XAPP_TOKEN
    },
    params: {
      size: 4,
      sort: '-trending',
      offset: artist_offset
    }
  };
  //axios.get(url, config *e.g headers and such*)
  return axios.get('https://api.artsy.net/api/artists', config)
    .catch(err => {
      console.log(err);
    })
}

app.get('/discover', async (req, res) => {
try {
  // when successful, Promise.all returns an array of the fulfilled promises (responses is an array)
  const [eventsRes, artworksRes, artistsRes] = await Promise.all([getEvents(), getArtworks(), getArtists()]); 

  const events = eventsRes.data._embedded.fairs;
  const artworks = artworksRes.data._embedded.artworks;
  const artists = artistsRes.data._embedded.artists;
  console.log(artists);
  // Give to discover.hbs
  // allow the discover page to access the returned events, artworks, artists
  res.render('pages/discover', { events, artworks, artists });
} catch (error) {
  console.error(error);

  // If the API call fails, render pages/discover with an empty results array and the error message
  res.render('pages/discover', { results: [], message: 'An error occurred while fetching data from the Artsy API.' });
}
});
// *****************************************************
// <!               Events - Khizar                   >
// *****************************************************
app.get('/events', (req, res) => {
  
  res.render('pages/events');
});

function Events(eventName, eventDescp, eventLink, eventDate, eventLocation, eventImage) {
  this.eventName = eventName;
  this.eventDescp = eventDescp;
  this.eventLink = eventLink;
  this.eventDate = eventDate;
  this.eventLocation = eventLocation;
  this.eventImage=eventImage;
}

function userEvents1(eventName, eventDescp, eventDate, eventLocation,eventImage,eventDateNoTime){
  this.eventName=eventName;
  this.eventDescp=eventDescp;
  this.eventDate=eventDate;
  this.eventLocation=eventLocation;
  this.eventImage=eventImage;
  this.eventDateNoTime=eventDateNoTime;

}

function getDaysOfWeek(){
  const weekdays= new Map(); //this map maps weekday names to their index
  weekdays.set(0,'Sunday');
  weekdays.set(1,'Monday');
  weekdays.set(2,'Tuesday');
  weekdays.set(3,'Wednesday');
  weekdays.set(4,'Thursday');
  weekdays.set(5,'Friday');
  weekdays.set(6,'Saturday');

  const today =new Date(); 
  const curr= today.getDay(); //get index of current day
  var daysOfWeek=[];
  for(var i=0; i<7;i++){
    daysOfWeek.push(weekdays.get((curr+i)%7)); //get the day of the week for the next 7 days
  }
  return daysOfWeek;
}

function getDatesForWeek(){
  var today = new Date();
  var dd = today.getDate();
  var mm = today.getMonth()+1; //January is 0!
  var yyyy = today.getFullYear();
  if(dd<10) {
      dd='0'+dd
  }
  if(mm<10) {
      mm='0'+mm
  }
  today = yyyy+'-'+mm+'-'+dd; //we now have the curent date
  var datesForWeek=[];
  for(var i=0; i<7; i++){
    var newDate = new Date(today);
    newDate.setDate(newDate.getDate()+i);
    datesForWeek.push(newDate.toISOString().slice(0, 10)); //get the date for the next 7 days
  }
  return datesForWeek;
}

Number.prototype.toRad = function() {
  return this * Math.PI / 180;
}

function getDistanceFromLatLonInKm(lat1,lon1,lat2,lon2) {
  // console.log(lat1, lon1);
  // console.log(lat2, lon2);
  var R = 6371; // km 
  //has a problem with the .toRad() method below.
  var x1 = lat2-lat1;
  var dLat = x1.toRad();  
  var x2 = lon2-lon1;
  var dLon = x2.toRad();  
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) + 
                  Math.cos(lat1.toRad()) * Math.cos(lat2.toRad()) * 
                  Math.sin(dLon/2) * Math.sin(dLon/2);  
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c; 
  console.log(d);
  return d;
}


app.post('/events', async(req,res)=>{
  const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  console.log(req.body)
  const lat =await req.body.latitude; //get user lat
  const long = await req.body.longitude; //get user long
  const currentDate = new Date();
  const currentISODate = currentDate.toISOString().slice(0, 19)+"Z"; // Format: 2024-04-11T07:33:26
  
  //const currentISODate = currentDate.toISOString(); // Format: 2024-04-11T07:33:26.162Z
  const futureDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
  //const futureISODate = futureDate.toISOString(); // Format: 2024-04-18T07:33:26.162Z
  const futureISODate = futureDate.toISOString().slice(0, 19)+"Z"; // Format: 2024-04-18T07:33:26

  //console.log(currentISODate, futureISODate);


  const results=await axios({ //get in the fine arts within one week of right now
    url: 'https://app.ticketmaster.com/discovery/v2/events.json',
    method: 'GET',
    params: {
      apikey: process.env.TICKET_API_KEY,
      startDateTime: currentISODate, //right now
      endDateTime: futureISODate, //one week from now
      classificationName: 'fine-art', //search in the fine arts
      //size: 10, //get 10 events
      sort: 'random' //sort 
    }
  });
  
  var eventsArr= []; //array to store events
  //console.log(results.data._embedded.events);
  for(var i=0; i<results.data._embedded.events.length; i++){
    var checker=false;
    var event = results.data._embedded.events[i];
    var eventName = event.name;
    var eventDescp = event.info;
    var eventLink = event.url;
    var eventDate = event.dates.start.localDate;
    var eventImage= event.images?.[0]?.url || "https://via.placeholder.com/150";
    var eventLocation= event._embedded.venues?.[0]?.name ||"Location not available";
   // console.log(i);
    //console.log(event);
    
    
    
    var newEvent = new Events(eventName, eventDescp, eventLink, eventDate, eventLocation, eventImage);
    for(var j=0; j<eventsArr.length; j++){ //check if event already in array
      if(eventsArr[j].eventName === newEvent.eventName){ //if it is
        //onsole.log("test");
        if(eventsArr[j].eventDate <= newEvent.eventDate){ //check if the date of the event in the array is less than the new event
          checker=true;
          break; //if it is, then no need to updatem, leave as is, and break the loop
        }
        else{
          eventsArr.splice(j, 1); //if the date of the event in the array is greater than the new event, remove the event in the array
        }
      }
    }
    if(checker) continue; //if the event is already in the array and the date is less than the new event, continue to the next event
    //if(i==0) console.log(event._embedded.venues[0].name);
    eventsArr.push(newEvent); //add the new event to the array
  }
  // for(var i=0; i<eventsArr.length; i++){
  //   console.log(eventsArr[i].eventName);
  //   console.log(eventsArr[i].eventDate);
  // }
  //console.log("TEST");

  //now we want to sort the array by date ascendng:
  eventsArr.sort(function(a,b){
    return new Date(a.eventDate) - new Date(b.eventDate);
  });

  for(var i=0; i<eventsArr.length; i++){
    console.log(eventsArr[i].eventName);
    console.log(eventsArr[i].eventDate);
  }

  // const user_id_for_admin= await db.oneOrNone('SELECT user_id FROM users WHERE username = $1', ["admin"]);
  // console.log(user_id_for_admin);

  let useEventsTemp;
  try {
    useEventsTemp = await db.many('SELECT * FROM events');
    // Handle useEventsTemp as needed
  } catch (error) {
    // Handle the error (e.g., log it or take appropriate action)
    console.error(error);
  }
  useEventsTemp= await db.many('SELECT * FROM events ORDER BY event_date ASC'); //pre sort by date 

/// console.log(useEventsTemp);
 var userEvents=[];

  for(var i=0; i<useEventsTemp.length; i++){ //loop through and check if lat and long is within 160 km (or about 100 mi) of user.
    //console.log(parseFloat(useEventsTemp[i].event_latitude), parseFloat(useEventsTemp[i].event_longitude)+20.0);
    //console.log(lat, long);
    var distance = getDistanceFromLatLonInKm(parseFloat(lat), parseFloat(long), parseFloat(useEventsTemp[i].event_latitude), parseFloat(useEventsTemp[i].event_longitude));
    
    console.log(distance);
    if(distance <= 160){
      const dateNoTime= useEventsTemp[i].event_date.toISOString().slice(0, 10);
      var newEvent = new userEvents1(useEventsTemp[i].event_name, useEventsTemp[i].event_description, useEventsTemp[i].event_date, useEventsTemp[i].event_location, useEventsTemp[i].event_image,dateNoTime);
      userEvents.push(newEvent);
    }
  }
  //now we want to sort userEvents by date asc
  // userEvents.sort(function(a,b){
  //   return new Date(a.eventDate) - new Date(b.eventDate);
  // });

  console.log(userEvents);
  //console.log(userEvents[0].eventDateNoTime);
  console.log(getDatesForWeek());
  // console.log(getDaysOfWeek());
  const daysOfWeek = getDaysOfWeek();
  const datesForWeek = getDatesForWeek();

  //now at this point one would hope we could just render the events page, by passing the following params:API_KEY, lat, long, eventsArr, userEvents, daysOfWeek, datesForWeek
  //API KEY for the map, lat and long for the map, eventsArr for the events, userEvents for the user events, daysOfWeek for the days of the week to put events (like Monday), and datesForWeek for the dates of the week (like 1/2/23)
  //but Handlebars is absolutely dog water and we cant pass non literals as the second argment to a handelbars helper, so we have to do this in the backend for some god forsaken reason.

  //we will literally pass 7 arrays back to the front end lmao. Each array will contain all events on that day.

  const events1= await db.manyOrNone('SELECT * FROM events WHERE event_date = $1', [datesForWeek[0]]);
  const events2= await db.manyOrNone('SELECT * FROM events WHERE event_date = $1', [datesForWeek[1]]);
  const events3= await db.manyOrNone('SELECT * FROM events WHERE event_date = $1', [datesForWeek[2]]);
  const events4= await db.manyOrNone('SELECT * FROM events WHERE event_date = $1', [datesForWeek[3]]);
  const events5= await db.manyOrNone('SELECT * FROM events WHERE event_date = $1', [datesForWeek[4]]);
  const events6= await db.manyOrNone('SELECT * FROM events WHERE event_date = $1', [datesForWeek[5]]);
  const events7= await db.manyOrNone('SELECT * FROM events WHERE event_date = $1', [datesForWeek[6]]);

  // console.log(datesForWeek[5]);
  // console.log(events6);
  
  res.render('pages/events', {API_KEY, lat, long, eventsArr, userEvents, daysOfWeek, datesForWeek, events1, events2, events3, events4, events5, events6, events7});
  
  
});

function parseSpaces(stringToParse){ //function to parse spaces in a string
  var newString = stringToParse.replace(/\s/g, '%20');
  return newString;


}

app.post('/addEvent', async(req,res)=>{
  const eventName = req.body.eventName;
  const eventDescp = req.body.description;
  const eventDate = req.body.eventDate;
  const streetAddy= req.body.streetAddress;
  const city = req.body.city;
  const state = req.body.state;
  const zip = req.body.postalCode;

  const eventLocation = streetAddy + " " + city + " " + state + " " + zip;
  const eventLocation2 = parseSpaces(eventLocation);
  const location=await axios({ //get in the fine arts within one week of right now
    url: 'https://maps.googleapis.com/maps/api/geocode/json',
    method: 'GET',
    params: {
      key: process.env.GOOGLE_MAPS_API_KEY,
      address: eventLocation2
    }
  });

  console.log(location.data.results[0].geometry.location.lat);
  console.log(location.data.results[0].geometry.location.lng);

  //now we can add the data to the events db:
  await db.none('INSERT INTO events(event_name, event_description, event_date, event_location, event_latitude, event_longitude) VALUES($1, $2, $3, $4, $5, $6)', [eventName, eventDescp, eventDate, eventLocation, location.data.results[0].geometry.location.lat, location.data.results[0].geometry.location.lng]);
  res.redirect('/events');


}); //add event to user events


// *****************************************************
// <!               Profile- Catherine                 >
// *****************************************************
app.get('/profile', async (req, res) => {
  try {
    const user_id = req.session.user.user_id;
    
    // Fetch user's followed artists
    const followedArtists = await db.any(
      `SELECT a.* 
       FROM artists a
       INNER JOIN user_artists ua ON a.artist_id = ua.artist_id
       WHERE ua.user_id = $1`,
      [user_id]
    );

    // Fetch user's events
    const userEvents = await db.any(
      `SELECT * 
       FROM events 
       WHERE user_id = $1`,
      [user_id]
    );

    // Render the profile page and pass the followed artists and user's events data to it
    res.render('pages/profile', { followedArtists, userEvents });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while fetching profile data.');
  }
});


// *****************************************************
// <!       Artist / Collection -Austin                >
// *****************************************************

var page = 1;

async function getArtistThumb_Bio(artistName) {
  const wikiURL = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages|extracts&titles=${artistName}&origin=*&pithumbsize=100`;
  try {
    const response = await axios.get(wikiURL);
    const pages = response.data.query.pages;
    const pageId = Object.keys(pages)[0];
    const artistInfo = pages[pageId];
    return {
      thumbnail: artistInfo.thumbnail ? artistInfo.thumbnail.source : null,
      extract: artistInfo.extract
    };
  } catch (error) {
    console.error(`Error retrieving data from Wikipedia for: ${artistName}`, error);
    return null; // or handle the error as you prefer
  }
}

app.get('/artists', async (req, res) => {
  const keyword = req.query.keyword;
  if (!keyword) {
    // Display all artists
    try {
      const artistData = await axios.get('https://api.artic.edu/api/v1/artists/search?=query=*&limit=100&page=1');

      // Retrieve additional data from Wikipedia for each artist
      const artistsWithThumbnails = await Promise.all(artistData.data.data.map(async (data) => {
        const artistInfo = await getArtistThumb_Bio(data.title);
        return {
          ...data,
          thumbnail: artistInfo.thumbnail,
          bio: artistInfo.extract
        };
      }));

      res.render('./pages/allArtists', { artists: artistsWithThumbnails});
    } catch (error) {
      console.error(error);
      res.render('./pages/allArtists', { message: 'Error generating web page. Please try again. Dev note: Index-728.' });
    }
  } else {
    // Redirect to the artist page based on the keyword
    res.redirect(`/artist/${keyword}`);
  }
});


// Display a specific artist's page based on an artistID from Art Institute of Chicago API
app.get('/artist/:artistID', async (req, res) => {
  const artistId = req.params.artistID;
  const artistURL = `https://api.artic.edu/api/v1/artists/${artistId}`;
  try {
    const artistResponse = await axios.get(artistURL);
    const artistData = artistResponse.data.data; // Adjusted according to the API response structure

    const wikiData = await getArtistThumb_Bio(artistData.title); // Assuming title is the correct field
    if (wikiData) {
      const artistInfo = {
        id: artistData.id, // Added id property
        name: artistData.title,
        thumbnail: wikiData.thumbnail,
        biography: wikiData.extract, // Changed from extract to biography
        bday: artistData.birth_date,
        dday: artistData.death_date,
        // Add other properties as needed
      };

      res.render('./pages/artist', { artist: artistInfo });
    } else {
      res.render('./pages/artist', { message: 'Error retrieving artist information.' });
    }
  } catch (error) {
    console.error(error);
    res.render('./pages/artist', { message: 'Error generating web page. Please try again later.' });
  }
});

module.exports = app;

app.post('/follow', async (req, res) => {
  try {
    // Assuming 'username' is stored in the session or passed in some other way
    const username = req.session.username; // or however you have stored the username
    const artistId = req.body.artistId;
    console.log(username+ " follows " + artistId);
    // Retrieve the user_id for the logged-in user
    const user = await db.one('SELECT user_id FROM users WHERE username = $1', [username]);

    // Implement the logic to follow the artist
    // For example, insert a record into a 'follows' table
    await db.none('INSERT INTO user_artists(user_id, artist_id) VALUES($1, $2)', [user.user_id, artistId]);

    // Send a success response back to the client
    res.status(200).json({ message: 'Follow successful' });
  } catch (error) {
    console.error('Follow failed:', error);
    res.status(500).json({ message: 'An error occurred while attempting to follow.' });
  }
});



// *****************************************************
// <!               Logout - Nate                   >
// *****************************************************

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.render('pages/logout', {message: 'Logged out Successfully!'});
});

// *****************************************************
// <!-- Section 5 : Start Server-->
// *****************************************************
// starting the server and keeping the connection open to listen for more requests
module.exports = app.listen(3000);
console.log('Server is listening on port 3000');

// *****************************************************
// <!-- Section 11 : Lab 11-->
// *****************************************************app.get('/welcome', (req, res) => {
  app.get('/welcome', (req, res) => {
    res.json({status: 'success', message: 'Welcome!'});
  });

//Below we add a one time user, named abc, with password 1234. This is for use in testing, and general data base stuff.
(async () => {
  const onetimeuser = 'abc';
  const onetimehash = await bcrypt.hash('1234', 10);
  const onetimeuserExists = await db.oneOrNone('SELECT username FROM users WHERE username = $1', [onetimeuser]);
  if (!onetimeuserExists) {
    await db.none('INSERT INTO users(username, password, email, firstname, lastname) VALUES($1, $2, $3, $4, $5)', [onetimeuser, onetimehash,'rehehe@gmail.com','Scooby','Doo']);
  }
})();