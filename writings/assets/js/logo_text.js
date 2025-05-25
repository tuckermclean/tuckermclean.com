// Replace the text in the logo with a different name based on the domain name

// First, select the logo text
const logo = document.querySelector('.logo');

// Select the link in the copyright footer
const copyrightLink = document.querySelector('.copyright a');

// Then, get the domain name
const domain = window.location.hostname;

// Then switch based on the domain name
switch (domain) {
    case 'alijamaluddin.com':
        logo.textContent = 'Ali Jamaluddin - Writings';
        copyrightLink.textContent = 'Ali Jamaluddin';
        break;
    case 'technomantics.com':
        logo.textContent = 'Developer McDev - Writings';
        copyrightLink.textContent = 'Developer McDev';
        break;
    default:
        logo.textContent = 'Tucker McLean - Writings';
        copyrightLink.textContent = 'Tucker McLean';
        break;
}