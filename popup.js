document.addEventListener('DOMContentLoaded', () => {
  const analysisResultsDiv = document.getElementById('analysis-results');
  
  // --- Modal Elements ---
  const suggestionsModal = document.getElementById('suggestions-modal');
  const profileModal = document.getElementById('profile-modal');
  const modals = document.querySelectorAll('.modal');
  
  const suggestionsBtn = document.getElementById('suggestions-btn');
  const profileBtn = document.getElementById('profile-btn');
  const saveSuggestionBtn = document.getElementById('save-suggestion-btn');
  const closeBtns = document.querySelectorAll('.close-btn');
  
  const suggestionText = document.getElementById('suggestion-text');

  // --- Modal Logic ---
  suggestionsBtn.onclick = () => { suggestionsModal.style.display = 'block'; };
  profileBtn.onclick = () => { profileModal.style.display = 'block'; };

  const closeAllModals = () => {
    modals.forEach(modal => { modal.style.display = 'none'; });
  };

  closeBtns.forEach(btn => { btn.onclick = closeAllModals; });

  window.onclick = (event) => {
    modals.forEach(modal => {
      if (event.target === modal) {
        closeAllModals();
      }
    });
  };

  // --- Suggestions Specific Logic ---
  const savedSuggestion = localStorage.getItem('suggestion');
  if (savedSuggestion) {
    suggestionText.value = savedSuggestion;
  }
  saveSuggestionBtn.onclick = function() {
    localStorage.setItem('suggestion', suggestionText.value);
    saveSuggestionBtn.textContent = 'Saved!';
    setTimeout(() => {
      suggestionsModal.style.display = "none";
      saveSuggestionBtn.textContent = 'Save Suggestion';
    }, 1000);
  }
  // --- End of Modal Logic ---

  function parseMoney(moneyString) {
      if (typeof moneyString !== 'string' || moneyString === 'N/A') return 0;
      let num = parseFloat(moneyString.replace(/[^0-9.]/g, ''));
      if (moneyString.toUpperCase().includes('K')) {
          num *= 1000;
      }
      if (moneyString.toUpperCase().includes('M')) {
          num *= 1000000;
      }
      return num;
  }

  // Query the active tab and send a message to the content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // Ensure we have a tab and it has a URL
    if (tabs.length === 0 || !tabs[0].url) {
      analysisResultsDiv.innerHTML = '<p class="error">Could not access tab information.</p>';
      return;
    }

    // Check if the tab is an Upwork job page
    if (!tabs[0].url.includes('upwork.com/jobs/')) {
      analysisResultsDiv.innerHTML = '<p class="error">This is not an Upwork job page. Please navigate to a job post to use this extension.</p>';
      return;
    }
    
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ['content.js']
    }, () => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'analyzeJob' }, (response) => {
        if (chrome.runtime.lastError) {
          analysisResultsDiv.innerHTML = `<p class="error">Error: ${chrome.runtime.lastError.message}</p>`;
          return;
        }
        if (response && response.jobData) {
          renderJobData(response.jobData);
          setupButtons(response.jobData);
        } else {
          analysisResultsDiv.innerHTML = '<p class="error">Failed to retrieve job data. The page structure might have changed.</p>';
        }
      });
    });
  });

  function renderJobData(data) {
    let historyHtml = data.clientHistory.map(item => `
      <div class="history-item">
        <strong>${item.projectTitle || 'N/A'}</strong>
        <p><em>Feedback to Client:</em> ${item.freelancerFeedback || 'N/A'}</p>
        <p><em>Feedback from Client:</em> ${item.clientFeedback || 'N/A'}</p>
      </div>
    `).join('');

    const paymentVerifiedIcon = `<svg class="verified-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-hidden="true"><path fill="var(--icon-color, #14a800)" fill-rule="evenodd" vector-effect="non-scaling-stroke" stroke="var(--icon-color, #14a800)" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M20.4 13.1c.8 1 .3 2.5-.9 2.9-.8.2-1.3 1-1.3 1.8 0 1.3-1.2 2.2-2.5 1.8-.8-.3-1.7 0-2.1.7-.7 1.1-2.3 1.1-3 0-.5-.7-1.3-1-2.1-.7-1.4.4-2.6-.6-2.6-1.8 0-.8-.5-1.6-1.3-1.8-1.2-.4-1.7-1.8-.9-2.9.5-.7.5-1.6 0-2.2-.9-1-.4-2.5.9-2.9.8-.2 1.3-1 1.3-1.8C5.9 5 7.1 4 8.3 4.5c.8.3 1.7 0 2.1-.7.7-1.1 2.3-1.1 3 0 .5.7 1.3 1 2.1.7 1.4-.5 2.6.5 2.6 1.7 0 .8.5 1.6 1.3 1.8 1.2.4 1.7 1.8.9 2.9-.4.6-.4 1.6.1 2.2z" clip-rule="evenodd"></path><path vector-effect="non-scaling-stroke" stroke="var(--icon-color-bg, #fff)" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M15.5 9.7L11 14.3l-2.5-2.5"></path></svg>`;
    const paymentNotVerifiedIcon = `<svg class="verified-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-hidden="true"><path fill="#d93025" fill-rule="evenodd" vector-effect="non-scaling-stroke" stroke="#d93025" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M20.4 13.1c.8 1 .3 2.5-.9 2.9-.8.2-1.3 1-1.3 1.8 0 1.3-1.2 2.2-2.5 1.8-.8-.3-1.7 0-2.1.7-.7 1.1-2.3 1.1-3 0-.5-.7-1.3-1-2.1-.7-1.4.4-2.6-.6-2.6-1.8 0-.8-.5-1.6-1.3-1.8-1.2-.4-1.7-1.8-.9-2.9.5-.7.5-1.6 0-2.2-.9-1-.4-2.5.9-2.9.8-.2 1.3-1 1.3-1.8C5.9 5 7.1 4 8.3 4.5c.8.3 1.7 0 2.1-.7.7-1.1 2.3-1.1 3 0 .5.7 1.3 1 2.1.7 1.4-.5 2.6.5 2.6 1.7 0 .8.5 1.6 1.3 1.8 1.2.4 1.7 1.8.9 2.9-.4.6-.4 1.6.1 2.2z" clip-rule="evenodd"></path><path vector-effect="non-scaling-stroke" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M15 9l-6 6m0-6l6 6"></path></svg>`;
    const proposalsWarningIcon = `<svg class="verified-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-hidden="true"><path fill="#ffc107" fill-rule="evenodd" vector-effect="non-scaling-stroke" stroke="#ffc107" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M20.4 13.1c.8 1 .3 2.5-.9 2.9-.8.2-1.3 1-1.3 1.8 0 1.3-1.2 2.2-2.5 1.8-.8-.3-1.7 0-2.1.7-.7 1.1-2.3 1.1-3 0-.5-.7-1.3-1-2.1-.7-1.4.4-2.6-.6-2.6-1.8 0-.8-.5-1.6-1.3-1.8-1.2-.4-1.7-1.8-.9-2.9.5-.7.5-1.6 0-2.2-.9-1-.4-2.5.9-2.9.8-.2 1.3-1 1.3-1.8C5.9 5 7.1 4 8.3 4.5c.8.3 1.7 0 2.1-.7.7-1.1 2.3-1.1 3 0 .5.7 1.3 1 2.1.7 1.4-.5 2.6.5 2.6 1.7 0 .8.5 1.6 1.3 1.8 1.2.4 1.7 1.8.9 2.9-.4.6-.4 1.6.1 2.2z" clip-rule="evenodd"></path><path vector-effect="non-scaling-stroke" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="2" d="M12 8v6m0 3v.01"></path></svg>`;
    const icons = { paymentVerifiedIcon, paymentNotVerifiedIcon, proposalsWarningIcon };

    let proposalsIcon = '';
    if (data.proposalsCount.includes('50+')) {
        proposalsIcon = paymentNotVerifiedIcon;
    } else if (data.proposalsCount.includes('Less than 5')) {
        proposalsIcon = paymentVerifiedIcon;
    } else {
        const match = data.proposalsCount.match(/(\d+)\s*to\s*(\d+)/);
        if (match) {
            const upperLimit = parseInt(match[2]);
            if (upperLimit <= 15) {
                proposalsIcon = paymentVerifiedIcon;
            } else if (upperLimit > 15 && upperLimit <= 50) {
                proposalsIcon = proposalsWarningIcon;
            }
        }
    }

    function generateStars(rating) {
        const totalStars = 5;
        const fullStar = '★';
        const emptyStar = '☆';
        const roundedRating = Math.round(rating);
        let stars = '';
        if (isNaN(roundedRating) || rating === 'N/A') return '';
        for (let i = 0; i < totalStars; i++) {
            stars += i < roundedRating ? fullStar : emptyStar;
        }
        return `<span class="star-rating">${stars}</span>`;
    }

    const starRating = generateStars(parseFloat(data.clientRating));

    let clientRatingIcon = '';
    if (data.clientRating === 'N/A') {
        clientRatingIcon = paymentNotVerifiedIcon;
    } else {
        const ratingValue = parseFloat(data.clientRating);
        const reviewsCountMatch = data.clientReviewsCount.match(/(\d+)/);
        const reviewsCount = reviewsCountMatch ? parseInt(reviewsCountMatch[1]) : 0;
        if (ratingValue >= 4.5 && reviewsCount >= 3) {
            clientRatingIcon = paymentVerifiedIcon;
        } else if (ratingValue >= 4.1 && ratingValue <= 4.4) {
            clientRatingIcon = proposalsWarningIcon;
        } else if (ratingValue < 4.1) {
            clientRatingIcon = paymentNotVerifiedIcon;
        }
    }

    let totalSpentIcon = '';
    const spentAmount = parseMoney(data.totalSpent);
    if (spentAmount > 5000) {
        totalSpentIcon = paymentVerifiedIcon;
    } else if (data.totalSpent === 'N/A') {
        totalSpentIcon = paymentNotVerifiedIcon;
    }

    let jobsPostedIcon = '';
    const jobsPostedValue = parseInt(data.clientJobsPosted);
    const hireRateValue = parseInt(data.clientHireRate.replace('%', ''));

    if (data.clientJobsPosted === 'N/A') {
        jobsPostedIcon = paymentNotVerifiedIcon;
    } else if (jobsPostedValue > 50 && hireRateValue > 75) {
        jobsPostedIcon = paymentVerifiedIcon;
    } else if (jobsPostedValue <= 5 && hireRateValue < 90) {
        jobsPostedIcon = paymentNotVerifiedIcon;
    }

    let hireRateIcon = '';
    if (data.clientHireRate === 'N/A') {
        hireRateIcon = paymentNotVerifiedIcon;
    } else {
        const hireRateValue = parseInt(data.clientHireRate.replace('%', ''));
        const jobsPostedValue = parseInt(data.clientJobsPosted);

        if (hireRateValue < 60) {
            hireRateIcon = paymentNotVerifiedIcon;
        } else if (hireRateValue >= 60 && hireRateValue <= 85) {
            hireRateIcon = proposalsWarningIcon;
        } else if (hireRateValue > 85) {
            if (jobsPostedValue > 5) {
                hireRateIcon = paymentVerifiedIcon;
            } else {
                hireRateIcon = proposalsWarningIcon;
            }
        }
    }

    let memberSinceIcon = '';
    if (data.clientJoinDate !== 'N/A') {
        const joinDate = new Date(data.clientJoinDate);
        const currentDate = new Date();
        const totalMonths = (currentDate.getFullYear() - joinDate.getFullYear()) * 12 + (currentDate.getMonth() - joinDate.getMonth());
        if (totalMonths < 6) {
            memberSinceIcon = paymentNotVerifiedIcon;
        } else if (totalMonths > 24) {
            memberSinceIcon = paymentVerifiedIcon;
        }
    }

    let avgRateIcon = '';
    let avgRateTooltipText = '';
    let avgRateLabel = 'Avg Rate / Hours';
    let avgRateValue = 'N/A';

    if (data.avgHourlyRate !== 'N/A') {
        avgRateValue = `${data.avgHourlyRate} / ${data.totalHours}`;
        const rateValue = parseFloat(data.avgHourlyRate.replace('$', ''));
        if (rateValue < 10) {
            avgRateIcon = paymentNotVerifiedIcon;
        } else if (rateValue <= 15) {
            avgRateIcon = proposalsWarningIcon;
        } else {
            avgRateIcon = paymentVerifiedIcon;
        }
    } else {
        avgRateLabel = 'Avg. Fixed-Price';
        const fixedPriceJobs = (data.clientHistory || [])
            .map(item => {
                if (item.jobPrice && item.jobPrice.toLowerCase().includes('fixed-price')) {
                    const match = item.jobPrice.match(/\$([\d,]+\.?\d*)/);
                    if (match && match[1]) return parseFloat(match[1].replace(/,/g, ''));
                }
                return null;
            })
            .filter(price => price !== null);

        if (fixedPriceJobs.length > 0) {
            const averagePrice = fixedPriceJobs.reduce((a, b) => a + b, 0) / fixedPriceJobs.length;
            avgRateValue = `~$${averagePrice.toFixed(2)}`;
            avgRateIcon = calculateClientQualityScore(data, icons); // Now returns just the icon string
        } else {
            avgRateValue = 'N/A';
            avgRateIcon = paymentNotVerifiedIcon;
        }
    }

    let jobAgeIcon = '';
    const jobAgeLowerCase = data.jobAge.toLowerCase();
    if (jobAgeLowerCase.includes('minute') || jobAgeLowerCase.includes('now') || jobAgeLowerCase.includes('1 hour')) {
        jobAgeIcon = paymentVerifiedIcon;
    }

    let connectsIcon = '';
    let connectsTooltipText = '';
    const requiredConnectsValue = parseInt(data.requiredConnects);
    if (!isNaN(requiredConnectsValue)) {
        if (requiredConnectsValue <= 15) {
            connectsIcon = paymentVerifiedIcon;
            connectsTooltipText = 'عدد الاتصالات المطلوب لهذه الوظيفة منخفض ومناسب نوعًا ما.';
        } else if (requiredConnectsValue <= 22) {
            connectsIcon = proposalsWarningIcon;
            connectsTooltipText = 'عدد الاتصالات المطلوب لهذه الوظيفة مرتفع قليلًا.';
        } else {
            connectsIcon = paymentNotVerifiedIcon;
            connectsTooltipText = 'عدد الاتصالات المطلوب لهذه الوظيفة مرتفع للغاية.';
        }
    }
    let connectsIconWithTooltip = '';
    if (connectsIcon) {
        connectsIconWithTooltip = `<span class="tooltip-container">${connectsIcon}<span class="tooltip-text">${connectsTooltipText}</span></span>`;
    }

    let lastViewedHtml = '';
    if (data.lastViewed && data.lastViewed !== 'N/A') {
        lastViewedHtml = `<dt>Last Viewed</dt><dd>${data.lastViewed}</dd>`;
    }

        let budgetIcon = '';

        let budgetTooltipText = '';

        if (data.jobType.toLowerCase().includes('hourly')) {

            let jobRate = 0;

            const rateNumbers = data.budgetOrRate.match(/\d+\.?\d*/g);

            if (rateNumbers) {

                const rates = rateNumbers.map(n => parseFloat(n));

                if (rates.length > 1) {

                    jobRate = (rates[0] + rates[1]) / 2; // Average of range

                } else if (rates.length === 1) {

                    jobRate = rates[0];

                }

            }

    

            if (jobRate > 0) { // Only apply icon if a valid rate was parsed

                const evalResult = getHourlyRateEvaluation(jobRate, data.experienceLevel, icons);

                budgetIcon = evalResult.icon;

                budgetTooltipText = evalResult.tooltip;

            }

            } else if (data.jobType.toLowerCase().includes('fixed-price')) { // Logic for fixed-price job budget

                const budgetResult = evaluateFixedPriceBudget(data, icons);

                budgetIcon = budgetResult.icon;

                budgetTooltipText = budgetResult.tooltip;

            }

        

            let budgetIconWithTooltip = '';

            if (budgetIcon) {

                budgetIconWithTooltip = `<span class="tooltip-container">${budgetIcon}<span class="tooltip-text">${budgetTooltipText}</span></span>`;

            }

        

            let invitesSentHtml = '';

            if (data.invitesSent && parseInt(data.invitesSent) > 0) {

                invitesSentHtml = `<dt>Invites Sent</dt><dd>${data.invitesSent}</dd>`;

            }

        

            let hiresHtml = '';

            if (data.hires && data.hires !== 'N/A') {

                hiresHtml = `<dt>Hires</dt><dd>${data.hires} ${parseInt(data.hires) > 0 ? paymentNotVerifiedIcon : ''}</dd>`;

            }

        

            let experienceIcon = '';

            let experienceTooltipText = '';

            const userExperience = localStorage.getItem('userExperienceLevel');

            const jobExperience = data.experienceLevel.toLowerCase();

        

            if (userExperience) {

                if (userExperience === 'Entry') {

                    if (jobExperience.includes('expert')) {

                        experienceIcon = paymentNotVerifiedIcon;

                        experienceTooltipText = 'مستوى خبرتك (مبتدئ) أقل بكثير من المطلوب (خبير).';

                    } else if (jobExperience.includes('intermediate')) {

                        experienceIcon = proposalsWarningIcon;

                        experienceTooltipText = 'مستوى خبرتك (مبتدئ) أقل من المطلوب (متوسط).';

                    } else { // Entry level

                        experienceIcon = paymentVerifiedIcon;

                        experienceTooltipText = 'مستوى خبرتك (مبتدئ) يتطابق مع المطلوب.';

                    }

                } else if (userExperience === 'Intermediate') {

                    if (jobExperience.includes('expert')) {

                        experienceIcon = proposalsWarningIcon;

                        experienceTooltipText = 'مستوى خبرتك (متوسط) أقل من المطلوب (خبير).';

                    } else if (jobExperience.includes('intermediate')) { // Intermediate matches Intermediate

                        experienceIcon = paymentVerifiedIcon;

                        experienceTooltipText = 'مستوى خبرتك (متوسط) يتطابق مع المطلوب.';

                    } else { // Intermediate exceeds Entry

                        experienceIcon = paymentVerifiedIcon;

                        experienceTooltipText = 'مستوى خبرتك (متوسط) يتجاوز المطلوب (مبتدئ).';

                    }

                } else if (userExperience === 'Expert') {

                    if (jobExperience.includes('expert')) { // Expert matches Expert

                        experienceIcon = paymentVerifiedIcon;

                        experienceTooltipText = 'مستوى خبرتك (خبير) يتطابق مع المطلوب.';

                    } else { // Expert exceeds Intermediate or Entry

                        experienceIcon = paymentVerifiedIcon;

                        experienceTooltipText = 'مستوى خبرتك (خبير) يتجاوز المطلوب.';

                    }

                }

            }

        

            let experienceIconWithTooltip = '';

            if (experienceIcon) {

                experienceIconWithTooltip = `<span class="tooltip-container">${experienceIcon}<span class="tooltip-text">${experienceTooltipText}</span></span>`;

            }

        

            analysisResultsDiv.innerHTML = `

              <div class="data-section">

                <h3>Job Details</h3>

                <dl>

                  <dt>Title</dt><dd>${data.jobTitle}</dd>

                  <dt>Type</dt><dd>${data.jobType}</dd>

                  <dt>Budget / Rate</dt><dd>${data.budgetOrRate} ${budgetIconWithTooltip}</dd>

                  <dt>Experience</dt><dd>${data.experienceLevel} ${experienceIconWithTooltip}</dd>

                  <dt>Connects</dt><dd>Required: ${data.requiredConnects} / Available: ${data.availableConnects} ${connectsIconWithTooltip}</dd>

                  <dt class="separator" colspan="2"></dt>

                  <dt>Posted</dt><dd>${data.jobAge} ${jobAgeIcon}</dd>

                  ${lastViewedHtml}

                  <dt>Proposals</dt><dd>${data.proposalsCount} ${proposalsIcon}</dd>

                  <dt>Interviewing</dt><dd>${data.interviewing}</dd>

                  ${invitesSentHtml}

                  ${hiresHtml}

                </dl>

                <h4>Full Job Description</h4>

                <div class="description-box">

                  <p id="full-description">${data.fullJobDescription}</p>

                </div>

              </div>

        

              <div class="data-section">

                <h3>Client Details</h3>

                <dl>

                  <dt>Payment Verified</dt><dd>${data.paymentVerified === 'Yes' ? paymentVerifiedIcon : paymentNotVerifiedIcon} ${data.paymentVerified}</dd>

                  <dt>Rating</dt><dd>${starRating} ${data.clientRating} (${data.clientReviewsCount}) ${clientRatingIcon}</dd>

                  <dt>Location</dt><dd>${data.clientLocation}</dd>

                  <dt>Total Spent</dt><dd>${data.totalSpent} ${totalSpentIcon}</dd>

                  <dt>Jobs Posted</dt><dd>${data.clientJobsPosted} ${jobsPostedIcon}</dd>

                  <dt>Hire Rate</dt><dd>${data.clientHireRate} (${data.openJobs} open) ${hireRateIcon}</dd>

                  <dt>${avgRateLabel}</dt><dd>${avgRateValue} ${avgRateIcon}</dd>

                  <dt>Member Since</dt><dd>${data.clientJoinDate} ${memberSinceIcon}</dd>

                </dl>

                <h4>Client Recent History (${data.clientHistory.length})</h4>

                <div class="history-container">

                  ${historyHtml || '<p>No recent history found.</p>'}

                </div>

              </div>

            `;

          }

        

            function evaluateFixedPriceBudget(data, icons) {

        

              // --- Primary Check: Deadline ---

        

              if (data.jobDeadline && data.jobDeadline !== 'N/A') {

        

                  let durationDays = 0;

        

                  try {

        

                      const deadlineDate = new Date(data.jobDeadline);

        

                      const today = new Date();

        

                      deadlineDate.setHours(0, 0, 0, 0);

        

                      today.setHours(0, 0, 0, 0);

        

                      const diffTime = deadlineDate - today;

        

                      durationDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        

                  } catch (e) {

        

                      // Invalid date format, proceed to next check

        

                  }

        

          

        

                  if (durationDays > 0) {

        

                      // Estimate daily hours

        

                      let dailyHours = 5; // Default

        

                      const description = data.fullJobDescription.toLowerCase();

        

                      if (description.includes('full-time') || description.includes('40 hours/week')) {

        

                          dailyHours = 8;

        

                      } else if (description.includes('part-time') || description.includes('20 hours/week')) {

        

                          dailyHours = 4;

        

                      }

        

          

        

                      const totalHours = durationDays * dailyHours;

        

                      const actualBudget = parseMoney(data.budgetOrRate);

        

          

        

                      if (totalHours > 0) {

        

                          const impliedRate = actualBudget / totalHours;

        

                          const evalResult = getHourlyRateEvaluation(impliedRate, data.experienceLevel, icons);

        

                          

        

                          let specificTooltip = '';

        

                          if (evalResult.icon === icons.paymentVerifiedIcon) {

        

                              specificTooltip = 'الميزانية المحددة لهذه الوظيفة ممتازة مقارنة بموعد التسليم.';

        

                          } else if (evalResult.icon === icons.proposalsWarningIcon) {

        

                              specificTooltip = 'الميزانية المحددة لهذه الوظيفة مقبولة مقارنة بموعد التسليم.';

        

                          } else if (evalResult.icon === icons.paymentNotVerifiedIcon) {

        

                              specificTooltip = 'الميزانية المحددة لهذه الوظيفة منخفضة مقارنة بموعد التسليم.';

        

                          }

        

                          return { icon: evalResult.icon, tooltip: specificTooltip || evalResult.tooltip };

        

                      }

        

                  }

        

              }

        

          

        

              // --- Secondary Check: High Budget ---

        

              const actualBudget = parseMoney(data.budgetOrRate);

        

              if (actualBudget >= 1000) {

        

                  return {

        

                      icon: icons.paymentVerifiedIcon,

        

                      tooltip: 'سعر الوظيفة مرتفع وممتاز، ولكن تأكد من المدة الزمنية للمشروع'

        

                  };

        

              }

        

          

        

              // If all checks fail, do nothing.

        

              return { icon: '', tooltip: '' };

        

            }

        

          function getHourlyRateEvaluation(rate, experienceLevel, icons) {

            const { paymentVerifiedIcon, proposalsWarningIcon, paymentNotVerifiedIcon } = icons;

            let icon = '';

            let tooltip = '';

        

            if (rate <= 15 && experienceLevel.toLowerCase().includes('expert')) {

                icon = paymentNotVerifiedIcon;

                tooltip = 'معدل منخفض لوظيفة تتطلب مستوى خبير.';

            } else if (rate < 10) {

                icon = paymentNotVerifiedIcon;

                tooltip = 'يعتبر هذا المعدل للساعة منخفضًا جدًا.';

            } else if (rate <= 15) {

                icon = proposalsWarningIcon;

                tooltip = 'يعتبر هذا المعدل للساعة متوسطًا.';

            } else if (rate >= 30) {

                icon = paymentVerifiedIcon;

                tooltip = 'يعتبر هذا المعدل للساعة ممتازًا للغاية.';

            } else { // rate > 15 and rate < 30

                icon = paymentVerifiedIcon;

                tooltip = 'يعتبر هذا المعدل للساعة جيدًا.';

            }

            return { icon, tooltip };

          }



  function calculateClientQualityScore(data, icons) {
      const { paymentVerifiedIcon, proposalsWarningIcon, paymentNotVerifiedIcon } = icons;

      let score_generosity = 0;
      if (data.clientHistory && data.clientHistory.length > 0) {
          const validJobs = data.clientHistory.map(item => {

              if (item.jobPrice && item.jobPrice.toLowerCase().includes('fixed-price')) {
                  const priceMatch = item.jobPrice.match(/\$([\d,]+\.?\d*)/);
                  const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;
                  const durationDays = parseDurationInDays(item.jobPrice);
                  if (price && durationDays) return { price, durationDays };
              }
              return null;
          }).filter(job => job !== null);

          if (validJobs.length > 0) {
              const totalSpent = validJobs.reduce((s, j) => s + j.price, 0);
              const totalDays = validJobs.reduce((s, j) => s + j.durationDays, 0);
              if (totalDays > 0) {
                  const avgDailyRate = totalSpent / totalDays;
                  const avgHourlyRate = avgDailyRate / 6;
                  if (avgHourlyRate > 15) score_generosity = 1;
                  else if (avgHourlyRate < 10) score_generosity = -1;
              }
          }
      }

      let score_professionalism = 0;
      const rating = parseFloat(data.clientRating);
      const reviewsMatch = data.clientReviewsCount.match(/(\d+)/);
      const reviews = reviewsMatch ? parseInt(reviewsMatch[1]) : 0;
      if (!isNaN(rating) && reviews > 0) {
          if (rating >= 4.7 && reviews >= 10) score_professionalism = 1;
          else if (rating >= 4.5 && reviews >= 5) score_professionalism = 0.5;
          else if (rating < 4.0) score_professionalism = -1;
          else if (rating < 4.5 && reviews < 5) score_professionalism = -0.5;
      }

      let score_behavior = 0;
      const hireRate = parseInt(data.clientHireRate.replace('%', ''));
      const jobsPosted = parseInt(data.clientJobsPosted);
      const totalSpentVal = parseMoney(data.totalSpent);
      if (!isNaN(hireRate) && !isNaN(jobsPosted)) {
          if (hireRate > 85 && jobsPosted > 10) score_behavior = 1;
          else if (hireRate > 60 && jobsPosted > 5) score_behavior = 0.5;
          else if (hireRate < 50 && jobsPosted > 10) score_behavior = -1;
      }
      if (!isNaN(totalSpentVal) && !isNaN(jobsPosted) && totalSpentVal < 100 && jobsPosted > 5) {
          score_behavior = -0.5;
      }

      let finalScore = (score_generosity * 0.5) + (score_professionalism * 0.3) + (score_behavior * 0.2);
      let confidenceAdjusted = false;

      const historyCount = data.clientHistory ? data.clientHistory.length : 0;
      if (historyCount < 3 || reviews < 3) {
          if (finalScore > 0.5) finalScore = 0.1;
          if (finalScore < -0.5) finalScore = -0.1;
          confidenceAdjusted = true;
      }

      if (finalScore > 0.3) return paymentVerifiedIcon;
      if (finalScore < -0.3) return paymentNotVerifiedIcon;
      return proposalsWarningIcon;
  }

  function setupButtons(data) {
    const copyBtn = document.getElementById('copy-all-btn');
    const downloadBtn = document.getElementById('download-btn');
    const copyBtnTextSpan = copyBtn.querySelector('span');
    const copyBtnIcon = copyBtn.querySelector('svg');

    const fullText = generateFullText(data);

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(fullText).then(() => {
        if (copyBtnTextSpan && copyBtnIcon) {
          copyBtnIcon.style.display = 'none';
          copyBtnTextSpan.textContent = 'Copied!';
        }
        setTimeout(() => {
          if (copyBtnTextSpan && copyBtnIcon) {
            copyBtnIcon.style.display = 'inline';
            copyBtnTextSpan.textContent = 'Copy All';
          }
        }, 2000);
      });
    });

    downloadBtn.addEventListener('click', () => {
      const blob = new Blob([fullText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.jobTitle.replace(/[^a-z0-9]/gi, '_')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
  
  function generateFullText(data) {
      let historyText = data.clientHistory.map(item => 
`Project: ${item.projectTitle}
  - Feedback to Client: ${item.freelancerFeedback}
  - Feedback from Client: ${item.clientFeedback}`
      ).join('\n\n');

      return `
---
JOB DETAILS ---
Job Title: ${data.jobTitle}
Job Type: ${data.jobType}
Budget / Rate: ${data.budgetOrRate}
Experience Level: ${data.experienceLevel}
Connects: Required ${data.requiredConnects} / Available ${data.availableConnects}
Posted: ${data.jobAge}
Last Viewed: ${data.lastViewed}
Proposals: ${data.proposalsCount}
Interviewing: ${data.interviewing}
Invites Sent: ${data.invitesSent}
Hires: ${data.hires}

---
CLIENT DETAILS ---
Payment Verified: ${data.paymentVerified}
Rating: ${data.clientRating} (${data.clientReviewsCount})
Location: ${data.clientLocation}
Total Spent: ${data.totalSpent}
Avg Hourly Rate: ${data.avgHourlyRate}
Total Hours: ${data.totalHours}
Jobs Posted: ${data.clientJobsPosted}
Hire Rate: ${data.clientHireRate} (${data.openJobs} open)
Member Since: ${data.clientJoinDate}

---
FULL JOB DESCRIPTION ---
${data.fullJobDescription}

---
CLIENT RECENT HISTORY ---
${historyText}
`;
  }

  // --- Profile Modal Logic ---
  const experienceRadios = document.querySelectorAll('input[name="experienceLevel"]');

  // Load saved experience level
  const savedExperience = localStorage.getItem('userExperienceLevel');
  if (savedExperience) {
    const radioToCheck = document.querySelector(`input[name="experienceLevel"][value="${savedExperience}"]`);
    if (radioToCheck) {
      radioToCheck.checked = true;
    }
  }

  // Save experience level on change
  experienceRadios.forEach(radio => {
    radio.addEventListener('change', (event) => {
      localStorage.setItem('userExperienceLevel', event.target.value);
    });
  });

});