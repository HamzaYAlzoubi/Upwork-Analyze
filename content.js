// content.js - This file contains the logic to interact with the Upwork page.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeJob') {
    try {
      const jobData = extractJobData();
      sendResponse({ jobData: jobData });
    } catch (error) {
      console.error("Upwork Analyze Extension Error:", error);
      sendResponse({ error: `Extraction failed: ${error.message}` });
    }
  }
  return true; // Indicates that the response is sent asynchronously
});

function extractJobData() {
  // Helper function to safely query a single element and return its text
  const getText = (selector, element = document) => {
    const el = element.querySelector(selector);
    return el ? el.innerText.trim() : 'N/A';
  };

  // Helper function to find an element containing specific text
  const findElementByText = (selector, text, element = document) => {
    const elements = element.querySelectorAll(selector);
    return Array.from(elements).find(el => el.innerText.trim().includes(text));
  };

  // --- Data Extraction ---

  const jobTitle = getText('h4.mt-0 span.flex-1');
  
  let fullJobDescription = 'N/A';
  const descriptionContainer = document.querySelector('[data-test="Description"]');
  if (descriptionContainer) {
      fullJobDescription = descriptionContainer.innerText.trim();
  }
  
  const jobTypeElement = findElementByText('ul.features li .description', 'price') || findElementByText('ul.features li .description', 'Hourly');
  const jobType = jobTypeElement ? jobTypeElement.innerText.trim() : 'N/A';
  
  let budgetOrRate = 'N/A';
  const fixedPriceEl = document.querySelector('ul.features li:has([data-cy="fixed-price"]) strong');
  const hourlyRateEl = document.querySelector('ul.features li:has([data-cy="clock-timelog"])');

  if (fixedPriceEl) {
      budgetOrRate = fixedPriceEl.innerText.trim();
  } else if (hourlyRateEl) {
      const minRate = getText('div[data-v-801afba5]:first-child strong', hourlyRateEl);
      const maxRate = getText('div[data-v-801afba5]:last-child strong', hourlyRateEl);
      if (minRate !== 'N/A' && maxRate !== 'N/A') {
          budgetOrRate = `${minRate} - ${maxRate}`;
      } else if (minRate !== 'N/A') {
          budgetOrRate = minRate;
      }
  }
  
  let jobAge = 'N/A';
  const postedOnLineEl = document.querySelector('.posted-on-line');
  if (postedOnLineEl && postedOnLineEl.children[0]) {
      jobAge = postedOnLineEl.children[0].innerText.replace('Posted', '').trim();
  }

  const getActivityValue = (activityTitle) => {
    const activityHeader = Array.from(document.querySelectorAll('h5')).find(
        h5 => h5.innerText.trim() === 'Activity on this job'
    );
    if (!activityHeader) return 'N/A';
    const activitySection = activityHeader.closest('section');
    if (!activitySection) return 'N/A';
    const allItems = activitySection.querySelectorAll('.ca-item');
    const targetItem = Array.from(allItems).find(item => {
        const titleEl = item.querySelector('.title');
        return titleEl && titleEl.innerText.trim() === activityTitle;
    });
    if (targetItem) {
        const valueEl = targetItem.querySelector('.value');
        return valueEl ? valueEl.innerText.trim() : 'N/A';
    }
    return 'N/A';
  };

  const proposalsCount = getActivityValue('Proposals:');
  const interviewing = getActivityValue('Interviewing:');
  const invitesSent = getActivityValue('Invites sent:');
  const lastViewed = getActivityValue('Last viewed by client:');
  const hires = getActivityValue('Hires:');

  let paymentVerified = 'No';
  const aboutClientContainer = findElementByText('h5', 'About the client')?.closest('[data-test="about-client-container"]');
  if (aboutClientContainer) {
      const paymentEl = findElementByText('strong', 'Payment method verified', aboutClientContainer);
      if (paymentEl) {
          paymentVerified = 'Yes';
      }
  }

  const clientLocation = getText('[data-qa="client-location"] strong');
  const experienceLevel = getText('li:has([data-cy="expertise"]) strong');
  
  const clientJoinDate = getText('[data-qa="client-contract-date"] small');
  
  const jobStatsText = getText('[data-qa="client-job-posting-stats"]');
  const hireRateMatch = jobStatsText.match(/(\d+%)\s+hire rate/);
  const openJobsMatch = jobStatsText.match(/(\d+)\s+open job/);
  const clientHireRate = hireRateMatch ? hireRateMatch[1] : 'N/A';
  const clientJobsPosted = getText('[data-qa="client-job-posting-stats"] strong');
  const openJobs = openJobsMatch ? openJobsMatch[1] : 'N/A';

  const avgHourlyRateText = getText('strong[data-qa="client-hourly-rate"]');
  const avgHourlyRate = avgHourlyRateText.split(' avg hourly rate paid')[0] || 'N/A';
  const totalHours = getText('div[data-qa="client-hours"]');

  const totalSpent = getText('strong[data-qa="client-spend"] span span');
  
  let clientRating = 'N/A';
  let clientReviewsCount = 'N/A';
  const ratingContainer = document.querySelector('[data-testid="buyer-rating"]');
  if (ratingContainer) {
      // --- RATING ---
      // Try the new structure first
      let ratingValueEl = ratingContainer.querySelector('.air3-rating-value-text');
      // If not found, try the old structure
      if (!ratingValueEl) {
          ratingValueEl = ratingContainer.querySelector('.air3-rating-point');
      }
      
      if (ratingValueEl) {
          clientRating = ratingValueEl.innerText.trim();
      } else {
          // As a fallback, try to get it from the combined text
          const ratingMatch = ratingContainer.innerText.match(/^(\d\.\d+)/);
          if (ratingMatch) {
              clientRating = ratingMatch[1];
          }
      }

      // --- REVIEW COUNT ---
      // Get all text content to parse from
      const fullText = ratingContainer.innerText;
      
      // Look for "(X reviews)" pattern first (old structure)
      let reviewsMatch = fullText.match(/\((\d+\s+reviews?)\)/);
      
      // If not found, look for "of X reviews" pattern (new structure)
      if (!reviewsMatch) {
          reviewsMatch = fullText.match(/of\s+(\d+\s+reviews?)/);
      }

      if (reviewsMatch) {
          clientReviewsCount = reviewsMatch[1]; // Group 1 captures "X reviews"
      }
  }

  let requiredConnects = 'N/A';
  let availableConnects = 'N/A';
  const connectsContainer = document.querySelector('div.text-light-on-muted[data-v-6d4ec4a7]');
  if (connectsContainer) {
      const requiredLabel = findElementByText('span', 'Required Connects to submit a proposal:', connectsContainer);
      if (requiredLabel && requiredLabel.nextElementSibling) {
          requiredConnects = requiredLabel.nextElementSibling.innerText.trim();
      }
      const availableDiv = findElementByText('div.mt-2', 'Available Connects:', connectsContainer);
      if (availableDiv) {
          availableConnects = availableDiv.innerText.replace('Available Connects:', '').trim();
      }
  }

  const recentHistoryItems = Array.from(document.querySelectorAll('[data-cy="job"].item'));
  const clientHistory = recentHistoryItems.map(item => {
    const projectTitle = getText('[data-cy="job-title"]', item);
    const freelancerName = getText('a[href*="/freelancers/"]', item);
    
    const clientFeedbackElement = item.querySelector('.text-body-sm.mt-2x.mb-2x');
    let clientFeedback = 'No feedback given';
    if (clientFeedbackElement && !clientFeedbackElement.innerText.includes('To freelancer:')) {
        clientFeedback = clientFeedbackElement.innerText.trim();
    }

    const freelancerFeedbackElement = findElementByText('.text-body-sm', 'To freelancer:', item);
    let freelancerFeedback = 'N/A';
    if (freelancerFeedbackElement) {
        const feedbackTextElement = freelancerFeedbackElement.querySelector('.air3-truncation span');
        if(feedbackTextElement) {
            freelancerFeedback = feedbackTextElement.innerText.trim();
        }
    }

    return {
      projectTitle,
      freelancerName,
      clientFeedback,
      freelancerFeedback
    };
  });

  return {
    jobTitle,
    fullJobDescription,
    jobType,
    budgetOrRate,
    jobAge,
    lastViewed,
    proposalsCount,
    interviewing,
    invitesSent,
    hires,
    paymentVerified,
    clientLocation,
    experienceLevel,
    clientJoinDate,
    clientHireRate,
    clientJobsPosted,
    openJobs,
    avgHourlyRate,
    totalHours,
    totalSpent,
    clientRating,
    clientReviewsCount,
    requiredConnects,
    availableConnects,
    clientHistory
  };
}
