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

// *****************************************************
// <!-- Section 2 : Connect to DB -->
// *****************************************************

// create `ExpressHandlebars` instance and configure the layouts and partials dir.
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: __dirname + '/views/layouts',
  partialsDir: __dirname + '/views/partials',
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
// <!-- Section 4 : API Routes -->
// *****************************************************

// TODO - Include your API routes here

// *****************************************************
// <!               Login - Amy                   >
// *****************************************************
const user = {
    username: undefined,
    password: undefined,
  };

  app.get('/login', (req, res) => {
    res.render('pages/login');
  });
  
  app.post('/login', async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
  

    try {
        // Find the user from the database
        const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [username]);
    
        if (user) {
          // Check if the entered password matches the stored hashed password
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
    try {
      const usernameLocal = req.body.username;
      const hash = await bcrypt.hash(req.body.password, 10);
  
      // Check if the username already exists in the database
      const userExists = await db.oneOrNone('SELECT username FROM users WHERE username = $1', [usernameLocal]);
  
      if (userExists) {
        // Username already exists, redirect to register page with error message
        return res.render('pages/register', { message: 'Username already exists. Please choose a different username.' });
      }
  
      // Register the user with the provided data
      await db.none('INSERT INTO users(username, password) VALUES($1, $2)', [usernameLocal, hash]);
  
      // Redirect to login after successful registration with message
      message = 'Success! Please login with new credentials: '
      res.render('pages/login', {message});
      } catch (error) {
      console.error(error);
      // Handle errors gracefully (e.g., display error message)
      res.render('pages/register', { message: 'An error occurred during registration. Please try again.' });
    }
  });
  
  
// *****************************************************
// <!     Authentication Middleware                   >
// *****************************************************
  // Authentication Middleware
  // const auth = (req, res, next) => {
  //   if (!req.session.user) {
  //     // Default to login page if not authenticated
  //     return res.redirect('/login');
  //   }
  //   next(); // Allow access if authenticated
  // };
  
  // app.use(auth);


  
// *****************************************************
// <!          Home / Discover-Ethan                  >
// *****************************************************

// Note: we have const axios above already.
app.get('/discover', async (req, res) => {
  try {
    const apiKey = process.env.API_KEY;
    const keyword = 'music'; // Change this keyword as needed

    const response = await axios({
      url: 'https://app.ticketmaster.com/discovery/v2/events.json',
      method: 'GET',
      dataType: 'json',
      headers: {
        'Accept-Encoding': 'application/json',
      },
      params: {
        apikey: apiKey,
        keyword: keyword,
        size: 10, // Size of events 
      },
    });

    // What we want from API response
    const results = response.data._embedded ? response.data._embedded.events : [];

    // Give to discover.hbs
    res.render('pages/discover', { results });
  } catch (error) {
    console.error(error);

    // If the API call fails, render pages/discover with an empty results array and the error message
    res.render('pages/discover', { results: [], message: 'An error occurred while fetching data from the Ticketmaster API.' });
  }
});


// *****************************************************
// <!               Events - Khizar                   >
// *****************************************************
app.get('/events', (req, res) => {
  res.render('./pages/events');
});


// *****************************************************
// <!               Login                   >
// *****************************************************


// *****************************************************
// <!               Profile- Catherine                 >
// *****************************************************


// *****************************************************
// <!       Artist / Collection -Austin                >
// *****************************************************

const xaccesstoken = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlcyI6IiIsInN1YmplY3RfYXBwbGljYXRpb24iOiIyZGRmN2VkOC1mZTAyLTQxN2YtYTM2Ni03NGE2NTg4NWNlODgiLCJleHAiOjE3MTMxMjI0NDcsImlhdCI6MTcxMjUxNzY0NywiYXVkIjoiMmRkZjdlZDgtZmUwMi00MTdmLWEzNjYtNzRhNjU4ODVjZTg4IiwiaXNzIjoiR3Jhdml0eSIsImp0aSI6IjY2MTJmMjBmNWUyMThiMDAwYjc5YjhjNSJ9.A6lDkBHBbQEjVZISEodcCDasnJgsmclvsQHK55V2Pqo';

app.get('/artists', async (req, res) => {
  try {
    // Fetch data from Artsy API
    const response = await axios.get('https://api.artsy.net/api/artists', {
      headers: {
        'X-Access-Token': xaccesstoken // Replace with your Artsy API access token
      }
    });

    // Extract artists from the response
    const artists = response.data;

    // Render the view with the fetched artists data
    res.render('./views/pages/allArtists', { artists });
  } catch (error) {
    console.error('Error fetching artists:', error);
    res.status(500).send('Error fetching artists');
  }
});


$(document).ready(function() {
  // Function to fetch popular artists data from Artsy API
  function fetchPopularArtists() {
    // Make an AJAX GET request to fetch popular artists
    $.ajax({
      url: 'https://api.artsy.net/api/popular_artists',
      type: 'GET',
      headers: {
        'X-Access-Token': xaccesstoken // Replace with your Artsy API access token
      },
      success: function(response) {
        // Populate popular artists section with fetched data
        var popularArtistsRow = $('#popularArtistsRow');
        response.forEach(function(artist) {
          var artistCard = `
            <div class="col-md-4">
              <div class="card">
                <div class="card-body">
                  <h5 class="card-title">${artist.name}</h5>
                  <p class="card-text">Followers: ${artist.followers_count}</p>
                  <!-- Add more artist information here as needed -->
                </div>
              </div>
            </div>
          `;
          popularArtistsRow.append(artistCard);
        });
      },
      error: function(xhr, status, error) {
        console.error('Error fetching popular artists:', error);
      }
    });
  }

  // Function to fetch trending artists data from Artsy API
  function fetchTrendingArtists() {
    // Make an AJAX GET request to fetch trending artists
    $.ajax({
      url: 'https://api.artsy.net/api/trending_artists',
      type: 'GET',
      headers: {
        'X-Access-Token': xaccesstoken // Replace with your Artsy API access token
      },
      success: function(response) {
        // Populate trending artists section with fetched data
        var trendingArtistsRow = $('#trendingArtistsRow');
        response.forEach(function(artist) {
          var artistCard = `
            <div class="col-md-4">
              <div class="card">
                <div class="card-body">
                  <h5 class="card-title">${artist.name}</h5>
                  <p class="card-text">Followers: ${artist.followers_count}</p>
                  <!-- Add more artist information here as needed -->
                </div>
              </div>
            </div>
          `;
          trendingArtistsRow.append(artistCard);
        });
      },
      error: function(xhr, status, error) {
        console.error('Error fetching trending artists:', error);
      }
    });
  }

  // Call functions to fetch and display popular and trending artists
  fetchPopularArtists();
  fetchTrendingArtists();
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