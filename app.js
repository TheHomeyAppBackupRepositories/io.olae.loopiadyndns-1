'use strict';

const Homey = require('homey');
const Axios = require('axios');

class LoopiaDyndns extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('Loopia Dyndns has been initialized');

    this.currentIp = null;
    this.loopia = Axios.create({
      baseURL: 'https://dyndns.loopia.se/'
    });

    // Update information at app startup, but only if configured
    if(
      this.homey.settings.getKeys().includes('login') &&
      this.homey.settings.getKeys().includes('password') &&
      this.homey.settings.getKeys().includes('domain')
    ) {
      this.updateInformation();

      // Schedule reccuring updates
      this.homey.setInterval(() => {
        this.updateInformation();
      }, 900000); // 15 minutes
    } else {
      this.homey.notifications.createNotification({
        excerpt: `Loopia Dyndns: ${this.homey.__('notifications.welcome')}`
      });
    }

    // Activate schedule when configured
    this.homey.settings.on('set', key => {
      if(
        this.homey.settings.getKeys().includes('login') &&
        this.homey.settings.getKeys().includes('password') &&
        this.homey.settings.getKeys().includes('domain')
      ) {
        this.updateInformation();

        // Schedule reccuring updates
        this.homey.setInterval(() => {
          this.updateInformation();
        }, 900000); // 15 minutes
      }
    })
  }

  async updateInformation() {
    this.log("Running a scheduled updated");

    var newIp = await this.getMyPublicIp();

    if( newIp === this.currentIp ) {
      this.log("IP address unchanged since last update");
      return;
    }

    // Send update to Loopia
    var r = await this.updateLoopia(this.homey.settings.get('domain'), newIp);
    if( r === null ) {
      this.log("Received null response back from updateLoopia()");
      return;
    }

    switch(r) {
      case 'nochg':
        this.log("updateLoopia() returned NoChange");
        break;

      case 'good':
        this.log("updateLoopia() returned successfull update");
        break;

      case 'nohost':
        this.log("updateLoopia() returned that no host exists");
        this.homey.notifications.createNotification({
          excerpt: `Loopia Dyndns: ${this.homey.__('notifications.nohost')}`
        });
        return;
        break;

        case 'badauth':
          this.log("updateLoopia() returned failed authentication");
          this.homey.notifications.createNotification({
            excerpt: `Loopia Dyndns: ${this.homey.__('notifications.badauth')}`
          });
          return;
          break;

      default:
        this.log("updateLoopia() returned unknown response: " + r);
        break;
    }

    // Everything went fine, so we'll update our local record
    this.currentIp = newIp;
  }

  async getMyPublicIp() {
    this.log("Fetching my public IP address from Loopias service");

    var body;
    try {
      const resp = await this.loopia.get('/checkip');
      this.log("Updated public IP information successfully fetched");
      body = resp.data;
    } catch(error) {
      this.log(error);
    }

    var regex = /Current IP Address: ([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/
    var match = regex.exec(body);

    if( match === null ) {
      this.log("Could not extract IP address from http response");
      return null;
    }

    this.log("Fetch of current public IP address returned " + match[1]);

    return match[1];
  }

  async updateLoopia(domain, ip) {
    this.log("Updating Loopia information for " + domain + " with IP " + ip);

    try {
      const resp = await this.loopia.get('/', {
        auth: {
          username: this.homey.settings.get('login'),
          password: this.homey.settings.get('password')
        },
        params: {
          hostname: domain,
          myip: ip
        }
      });

      return resp.data;
    } catch(error) {
      this.log(error);
    }

    this.log("Update of Loopia information FAILED");

    return null;
  }
}

module.exports = LoopiaDyndns;
