(() => {
  const body = document.body;
  const API_BASE_URL = (window.RSVP_API_BASE || body.dataset.apiBase || '').replace(/\/$/, '');
  const container = document.getElementById('app');
  if (!container) return;

  const EVENT = {
    summaryLink: 'https://davidandsuzygotmarried.com/california',
    highlights: [
      { icon: '📍', title: 'Location', text: 'Donato Enoteca · 1041 Middlefield Rd · Redwood City' },
      { icon: '⏰', title: 'Schedule', text: 'Cocktails at 5:00 PM · Dinner at 6:00 PM' },
      { icon: '📱', title: 'Need anything?', text: 'Text David at (510) 403-1367.' },
    ],
  };

  const DEFAULT_DINNER_SELECTION = {
    starter: 'braised meatballs',
    main: 'tenderloin',
    dessert: 'lime curd',
  };

  const ATTENDANCE_OPTIONS = [
    {
      id: 'both',
      label: 'Cocktails & Dinner',
      description: 'Arrive for champagne at 5 PM and stay through dinner.',
      attendingDrinks: true,
      attendingDinner: true,
      unable: false,
    },
    {
      id: 'cocktails',
      label: 'Cocktails only',
      description: 'Stop by for the 5 PM cocktail hour.',
      attendingDrinks: true,
      attendingDinner: false,
      unable: false,
    },
    {
      id: 'dinner',
      label: 'Dinner only',
      description: 'Join us for dinner at 6 PM.',
      attendingDrinks: false,
      attendingDinner: true,
      unable: false,
    },
    {
      id: 'neither',
      label: 'Can’t make it',
      description: 'Send your love from afar.',
      attendingDrinks: false,
      attendingDinner: false,
      unable: true,
    },
  ];

  const renderHighlights = () => {
    if (!Array.isArray(EVENT.highlights) || !EVENT.highlights.length) return '';
    const items = EVENT.highlights
      .map(({ icon = '✨', title = '', text = '' }) => {
        if (!text) return '';
        const safeIcon = escapeHtml(icon);
        const safeText = escapeHtml(text);
        const titleBlock = title
          ? `<span class="block text-xs uppercase tracking-[0.3em] text-teal/70">${escapeHtml(title)}</span>`
          : '';
        return `
          <li class="flex items-start gap-3">
            <span class="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-mist/80 text-base">${safeIcon}</span>
            <div class="text-sm text-lagoon/80">
              ${titleBlock}
              <span>${safeText}</span>
            </div>
          </li>
        `;
      })
      .filter(Boolean)
      .join('');
    if (!items) return '';
    return `
      <aside class="rounded-[1.5rem] border border-teal/30 bg-white/80 p-5 shadow-sm">
        <ul class="space-y-4">${items}</ul>
      </aside>
    `;
  };

  const HOST_CONTACT_HTML = `Text or call <span class="font-semibold">David</span> at <a href="tel:+15104031367" class="font-semibold text-teal hover:text-teal/80 focus:text-teal/80">(510) 403-1367</a>.`;

  const state = {
    code: '',
    status: 'idle',
    loadError: '',
    names: [],
    people: {},
    submitStatus: 'idle',
    submitMessage: '',
    formError: '',
    fieldErrors: {},
    summary: null,
  };

  const submittingOverlay = document.createElement('div');
  submittingOverlay.id = 'rsvp-submitting-overlay';
  submittingOverlay.className = 'fixed inset-0 z-[60] hidden items-center justify-center bg-cloud/80 backdrop-blur-sm';
  submittingOverlay.innerHTML = `
    <div class="flex flex-col items-center gap-5 rounded-[2rem] border border-teal/50 bg-white/90 px-10 py-8 text-center shadow-lg">
      <span class="relative inline-flex h-20 w-20 items-center justify-center">
        <span class="absolute inset-0 animate-ping rounded-full bg-teal/40"></span>
        <span class="relative inline-flex h-16 w-16 items-center justify-center rounded-full border-4 border-teal/30 bg-mist/90 text-3xl font-serif text-teal">✨</span>
      </span>
      <div class="space-y-2">
        <p class="font-serif text-2xl text-lagoon">Sending your RSVP…</p>
        <p class="text-sm text-lagoon/70">We’re sharing your answers with David &amp; Suzy. One moment!</p>
      </div>
    </div>
  `;
  body.appendChild(submittingOverlay);

  const toggleSubmittingOverlay = (visible) => {
    if (visible) {
      submittingOverlay.classList.remove('hidden');
      submittingOverlay.classList.add('flex');
    } else {
      submittingOverlay.classList.add('hidden');
      submittingOverlay.classList.remove('flex');
    }
  };

  const escapeHtml = (value) =>
    value.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char]);

  const encodeBase64 = (value) => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(value);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  };

  const slugify = (value, index) =>
    `${value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${index}`;

  const createPersonState = (name) => ({
    name,
    attendingDrinks: false,
    attendingDinner: false,
    unable: false,
    plusOneName: '',
    menu: { ...DEFAULT_DINNER_SELECTION },
  });

  const getAttendanceSelection = (person) => {
    if (person.unable) return 'neither';
    if (person.attendingDrinks && person.attendingDinner) return 'both';
    if (person.attendingDrinks) return 'cocktails';
    if (person.attendingDinner) return 'dinner';
    return '';
  };

  const applyAttendanceSelection = (person, selection) => {
    const option = ATTENDANCE_OPTIONS.find((entry) => entry.id === selection);
    if (!option) return;
    person.attendingDrinks = option.attendingDrinks;
    person.attendingDinner = option.attendingDinner;
    person.unable = option.unable;
    if (person.attendingDinner) {
      person.menu = { ...DEFAULT_DINNER_SELECTION };
    }
  };

  const clearFieldError = (name) => {
    if (state.fieldErrors[name]) {
      const updated = { ...state.fieldErrors };
      delete updated[name];
      state.fieldErrors = updated;
    }
  };

  const setFieldError = (name, type, message) => {
    state.fieldErrors = { ...state.fieldErrors, [name]: { type, message } };
    state.formError = 'Please correct the highlighted fields below.';
  };

  const resetSubmitState = () => {
    state.submitStatus = 'idle';
    state.submitMessage = '';
    state.formError = '';
  };

  const updateUrlWithCode = (code) => {
    const url = new URL(window.location.href);
    if (code) {
      url.searchParams.set('code', code);
    } else {
      url.searchParams.delete('code');
    }
    window.history.replaceState({}, '', url.toString());
  };

  const setView = (view) => {
    container.setAttribute('data-view', view);
  };

  const render = () => {
    const {
      code,
      status,
      loadError,
      names,
      submitStatus,
      submitMessage,
      formError,
      summary,
    } = state;
    toggleSubmittingOverlay(submitStatus === 'submitting');

    if (!code) {
      setView('idle');
      container.innerHTML = `
        <form id="code-form" class="space-y-8">
          <header class="space-y-3 text-center">
            <h2 class="font-serif text-2xl text-lagoon">Enter your RSVP code</h2>
            <p class="text-sm text-lagoon/70">Your email invitation includes a short code. Please paste it in here to RSVP.</p>
          </header>
          ${loadError ? `<p class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">${escapeHtml(loadError)}</p>` : ''}
          <div class="space-y-2">
            <label for="code-input" class="block text-sm font-medium text-lagoon/80">RSVP code</label>
            <input id="code-input" name="code" type="text" required autocomplete="off" class="w-full rounded-2xl border border-teal/30 bg-white/90 px-4 py-3 text-base text-lagoon shadow-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/40" placeholder="e.g. california-party" />
          </div>
          <button type="submit" class="inline-flex w-full items-center justify-center rounded-full bg-teal px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-teal/90 focus:outline-none focus:ring-2 focus:ring-teal/40">Find my invitation</button>
        </form>
      `;

      const form = container.querySelector('#code-form');
      if (form) {
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const formData = new FormData(form);
          const value = (formData.get('code') || '').toString().trim();
          if (!value) return;
          state.code = value;
          resetSubmitState();
          updateUrlWithCode(value);
          fetchPeople();
        });
      }
      return;
    }

    if (status === 'loading') {
      setView('loading');
      container.innerHTML = `
        <div class="space-y-6 text-center">
          <div class="flex justify-center">
            <span class="inline-flex h-14 w-14 items-center justify-center rounded-full border-4 border-teal/30 border-t-teal/80">
              <span class="h-7 w-7 animate-ping rounded-full bg-teal/60"></span>
            </span>
          </div>
          <div>
            <p class="font-serif text-2xl text-lagoon">Checking your invitation…</p>
            <p class="mt-2 text-sm text-lagoon/70">We’re fetching the names linked to your invite.</p>
          </div>
        </div>
      `;
      return;
    }

    if (status === 'error') {
      setView('error');
      container.innerHTML = `
        <div class="space-y-6 text-center">
          <div class="space-y-3">
            <h2 class="font-serif text-2xl text-lagoon">We couldn't find that code</h2>
            <p class="text-sm text-lagoon/70">${escapeHtml(
                (loadError === 'Authorization code not recognized' || !loadError) ? 'Double-check the spelling on your invitation and try again.' : loadError)}</p>
          </div>
          <div class="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button type="button" data-action="retry" class="inline-flex items-center justify-center rounded-full bg-teal px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-teal/90 focus:outline-none focus:ring-2 focus:ring-teal/40">Try another code</button>
          </div>
        </div>
      `;

      const retry = container.querySelector('[data-action="retry"]');
      if (retry) {
        retry.addEventListener('click', () => {
          state.code = '';
          state.status = 'idle';
          state.loadError = '';
          state.names = [];
          state.people = {};
          resetSubmitState();
          updateUrlWithCode('');
          render();
        });
      }
      return;
    }

    if (status === 'summary' && summary) {
      setView('summary');
      const submittedAtRaw = summary.submittedAt || '';
      const submittedAtLabel = submittedAtRaw
        ? new Date(submittedAtRaw).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
        : '';

      let summaryTitle = 'RSVP already submitted';
      let summaryBody = 'We already have this RSVP on file. If anything changes, please reach out.';
      if (summary.notice === 'success') {
        summaryTitle = 'RSVP received — thank you!';
        summaryBody = 'We saved your responses below. If anything changes, please let us know.';
      } else if (summary.notice === 'locked' && summary.message) {
        summaryBody = summary.message;
      } else if (summary.notice === 'existing' && summary.message) {
        summaryBody = summary.message;
      }

      const summaryCards = names
        .map((name, index) => {
          const record = summary.rsvps ? summary.rsvps[name] : undefined;
          const slug = slugify(name, index);
          if (!record) {
            return `
              <article class="space-y-4 rounded-[1.75rem] border border-teal/30 bg-white/80 p-6 shadow-sm">
                <header class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 class="font-serif text-xl text-lagoon">${escapeHtml(name)}</h3>
                  <span class="text-xs uppercase tracking-[0.3em] text-teal/70">Guest</span>
                </header>
                <p class="text-sm text-lagoon/70">We don’t have RSVP details for this guest yet.</p>
              </article>
            `;
          }

          const drinksLine = record.attendingDrinks
            ? 'Joining for the cocktail hour'
            : 'Skipping the cocktail hour';

          const dinnerLine = record.attendingDinner
            ? 'Sharing dinner with us'
            : 'Not staying for dinner';

          const notesBlock = record.notes
            ? `
                <div class="rounded-2xl border border-dashed border-teal/30 bg-white/70 px-4 py-3 text-sm text-lagoon/80">
                  <p class="text-xs uppercase tracking-[0.3em] text-teal/70">Notes</p>
                  <p class="mt-1">${escapeHtml(record.notes)}</p>
                </div>
              `
            : '';

          return `
            <article class="space-y-5 rounded-[1.75rem] border border-teal/40 bg-white/85 p-6 shadow-sm" id="${slug}-summary">
              <header class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 class="font-serif text-xl text-lagoon">${escapeHtml(name)}</h3>
                <span class="text-xs uppercase tracking-[0.3em] text-teal/70">${record.attendingDinner || record.attendingDrinks ? 'Celebrating with you' : 'Can\'t make it'}</span>
              </header>
              <ul class="space-y-3 text-sm text-lagoon/80">
                <li class="flex items-center gap-3">
                  <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-mist/80 text-sm text-teal">🍸</span>
                  <span>${escapeHtml(drinksLine)}</span>
                </li>
                <li class="flex items-center gap-3">
                  <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-mist/80 text-sm text-teal">🍽️</span>
                  <span>${escapeHtml(dinnerLine)}</span>
                </li>
              </ul>
              ${notesBlock}
            </article>
          `;
        })
        .join('');

      container.innerHTML = `
        <section class="space-y-8">
          <header class="space-y-4 rounded-[1.75rem] border border-teal/30 bg-mist/60 p-6 text-center sm:text-left">
            <div class="space-y-2">
              <h2 class="font-serif text-2xl text-lagoon">${escapeHtml(summaryTitle)}</h2>
              <p class="text-sm text-lagoon/70">${escapeHtml(summaryBody)}</p>
              <p class="text-sm text-lagoon/70">${HOST_CONTACT_HTML}</p>
              ${submittedAtLabel ? `<p class="text-xs uppercase tracking-[0.3em] text-teal/60">Submitted ${escapeHtml(submittedAtLabel)}</p>` : ''}
            </div>
            <div class="flex justify-center sm:justify-start">
              <button type="button" data-action="event-info" class="inline-flex items-center justify-center rounded-full border border-teal/40 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-teal transition hover:border-teal/60 hover:bg-mist focus:outline-none focus:ring-2 focus:ring-teal/40">Event Information</button>
            </div>
          </header>
          ${renderHighlights()}
          <div class="space-y-6">
            ${summaryCards}
          </div>
        </section>
      `;

      const infoBtn = container.querySelector('[data-action="event-info"]');
      if (infoBtn) {
        infoBtn.addEventListener('click', () => {
          window.location.href = EVENT.summaryLink;
        });
      }
      return;
    }

    if (status === 'ready') {
      setView('form');
      const fieldErrors = state.fieldErrors || {};

      const personSections = names
        .map((name, index) => {
          const person = state.people[name];
          if (!person) return '';
          const slug = slugify(name, index);
          const plusOne = name.includes('+1');
          const personError = fieldErrors[name] || null;
          const attendanceError = personError && personError.type === 'attendance' ? personError.message : '';
          const plusOneError = personError && personError.type === 'plus-one' ? personError.message : '';

          const attendanceSelection = getAttendanceSelection(person);
          const attendanceChoices = ATTENDANCE_OPTIONS.map((option) => {
            const radioId = `${slug}-attendance-${option.id}`;
            const active = attendanceSelection === option.id;
            const classes = [
              'flex flex-col rounded-2xl border p-4 text-left transition',
              active ? 'border-teal bg-mist/90' : 'border-teal/30 bg-white/80 hover:border-teal/60',
            ].join(' ');
            return `
              <label for="${radioId}" class="${classes}">
                <span class="flex items-center gap-3">
                  <input type="radio" id="${radioId}" name="${slug}-attendance" value="${option.id}" ${active ? 'checked' : ''} data-name="${escapeHtml(name)}" data-field="attendance" class="h-4 w-4 border-teal text-teal focus:ring-teal" />
                  <span class="font-semibold text-lagoon">${option.label}</span>
                </span>
                <span class="mt-2 text-sm text-lagoon/70">${option.description}</span>
              </label>
            `;
          }).join('');

          return `
            <article class="space-y-6 rounded-[1.75rem] border border-teal/40 bg-white/85 p-6 shadow-sm">
              <header class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 class="font-serif text-xl text-lagoon">${escapeHtml(name)}</h3>
                <p class="text-xs uppercase tracking-[0.3em] text-teal/70">Dinner party guest</p>
              </header>

              ${plusOne ? `
                <div class="space-y-2">
                  <label for="${slug}-plusone" class="block text-sm font-medium text-lagoon/80">Plus-one name</label>
                  <input id="${slug}-plusone" type="text" value="${escapeHtml(person.plusOneName)}" data-name="${escapeHtml(name)}" data-field="plus-one" placeholder="Tell us their name" class="w-full rounded-2xl border border-teal/30 bg-white/90 px-4 py-3 text-base text-lagoon shadow-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/40" />
                  ${plusOneError ? `<p class="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">${escapeHtml(plusOneError)}</p>` : ''}
                </div>
              ` : ''}

              <div class="space-y-4">
                <div class="grid gap-3 md:grid-cols-2">${attendanceChoices}</div>
                ${attendanceError ? `<p class="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">${escapeHtml(attendanceError)}</p>` : ''}
              </div>
            </article>
          `;
        })
        .join('');

      const failureNotice =
        submitStatus === 'failure'
          ? `
              <div class="space-y-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <p>${escapeHtml(submitMessage || 'We ran into a problem saving your RSVP. Please try again.')}</p>
                <p class="text-xs text-red-700/80">${HOST_CONTACT_HTML}</p>
              </div>
            `
          : '';

      container.innerHTML = `
        <form id="rsvp-form" class="space-y-8">
          ${renderHighlights()}

          ${formError ? `<p class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">${escapeHtml(formError)}</p>` : ''}
          ${submitStatus === 'success' ? `<p class="rounded-2xl border border-teal/40 bg-mist/70 px-4 py-3 text-sm text-teal/90">${escapeHtml(submitMessage || 'RSVP submitted! We’ll see you soon.')}</p>` : ''}
          ${failureNotice}

          <div class="space-y-6">
            ${personSections}
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button id="submit" type="submit" ${submitStatus === 'submitting' ? 'disabled' : ''} class="inline-flex items-center justify-center rounded-full bg-teal px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-teal/90 focus:outline-none focus:ring-2 focus:ring-teal/40 disabled:cursor-not-allowed disabled:opacity-70">
              ${submitStatus === 'submitting' ? 'Sending RSVP…' : 'Submit RSVP'}
            </button>
          </div>
        </form>
      `;

      const form = container.querySelector('#rsvp-form');
      if (form) {
        form.addEventListener('change', (event) => {
          const target = event.target;
          if (!(target instanceof HTMLInputElement)) return;
          const name = target.dataset.name;
          const field = target.dataset.field;
          if (!name || !field) return;
          const person = state.people[name];
          if (!person) return;

        if (field === 'attendance') {
          applyAttendanceSelection(person, target.value);
        }

        clearFieldError(name);

        resetSubmitState();
        window.requestAnimationFrame(() => render());
      });

        form.addEventListener('input', (event) => {
          const target = event.target;
          if (!(target instanceof HTMLInputElement)) return;
          const name = target.dataset.name;
          if (!name) return;
          if (target.dataset.field === 'plus-one') {
            const person = state.people[name];
            if (person) {
              person.plusOneName = target.value;
              if (target.value.trim()) {
                clearFieldError(name);
              }
            }
          }
        });

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (!API_BASE_URL) {
            state.formError = 'Missing API base URL. Ask your host to set the `data-api-base` attribute on this page.';
            render();
            return;
          }

          const payload = [];
          for (const name of names) {
            const person = state.people[name];
            if (!person) continue;

            if (!person.unable && !person.attendingDrinks && !person.attendingDinner) {
              setFieldError(name, 'attendance', `Choose attendance for ${name}.`);
              render();
              return;
            }

            if ((person.attendingDrinks || person.attendingDinner) && name.includes('+1') && !person.plusOneName.trim()) {
              setFieldError(name, 'plus-one', `Tell us the name of the guest for ${name}.`);
              render();
              return;
            }

            const entry = {
              name,
              attendingDrinks: !person.unable && person.attendingDrinks,
              attendingDinner: !person.unable && person.attendingDinner,
            };

            if (entry.attendingDinner) {
              entry.menu = {
                starter: person.menu?.starter || DEFAULT_DINNER_SELECTION.starter,
                main: person.menu?.main || DEFAULT_DINNER_SELECTION.main,
                dessert: person.menu?.dessert || DEFAULT_DINNER_SELECTION.dessert,
              };
            }

            if (name.includes('+1') && person.plusOneName.trim()) {
              entry.notes = `Plus-one name: ${person.plusOneName.trim()}`;
            }

            payload.push(entry);
          }

          if (!payload.length) {
            state.formError = 'Add at least one guest to continue.';
            render();
            return;
          }

          state.formError = '';
          state.submitStatus = 'submitting';
          state.submitMessage = '';
          render();

          try {
            const response = await fetch(`${API_BASE_URL}/submit-rsvp`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${encodeBase64(state.code)}`,
              },
              body: JSON.stringify({ people: payload }),
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              if (response.status === 409) {
                const rsvps = data && typeof data.rsvps === 'object' && data.rsvps !== null ? data.rsvps : {};
                state.summary = {
                  rsvps,
                  submittedAt: data && data.submittedAt,
                  notice: 'locked',
                  message: data && data.message ? data.message : 'We already have this RSVP on file for your code.',
                };
                state.status = 'summary';
                state.submitStatus = 'idle';
                state.submitMessage = '';
                state.formError = '';
                render();
                return;
              }

              state.submitStatus = 'failure';
              state.submitMessage = data && data.message ? data.message : 'Unable to submit your RSVP right now.';
              render();
              return;
            }

            const fallbackTimestamp = new Date().toISOString();
            const rsvps =
              data && typeof data.rsvps === 'object' && data.rsvps !== null
                ? data.rsvps
                : payload.reduce((acc, entry) => {
                    acc[entry.name] = {
                      attendingDrinks: entry.attendingDrinks,
                      attendingDinner: entry.attendingDinner,
                      notes: entry.notes,
                      submittedAt: fallbackTimestamp,
                    };
                    return acc;
                  }, {});

            state.summary = {
              rsvps,
              submittedAt: data && data.submittedAt ? data.submittedAt : fallbackTimestamp,
              notice: 'success',
              message: data && data.message ? data.message : 'RSVP submitted successfully. We will confirm shortly.',
            };
            state.status = 'summary';
            state.submitStatus = 'success';
            state.submitMessage = state.summary.message;
            render();
          } catch (error) {
            console.error('Error submitting RSVP', error);
            state.submitStatus = 'failure';
            state.submitMessage = 'We lost the connection while saving. Please try again.';
            render();
          }
        });
      }
      return;
    }

    container.innerHTML = `
      <div class="space-y-3 text-center">
        <p class="font-serif text-2xl text-lagoon">Almost ready…</p>
        <p class="text-sm text-lagoon/70">If you stay on this screen, refresh the page to restart.</p>
      </div>
    `;
  };

  const fetchPeople = async () => {
    if (!state.code) {
      state.status = 'idle';
      render();
      return;
    }

    state.status = 'loading';
    state.loadError = '';
    resetSubmitState();
    render();

    if (!API_BASE_URL) {
      state.status = 'error';
      state.loadError = 'Missing API base URL. Ask your host to set the `data-api-base` attribute on this page.';
      render();
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/people`, {
        headers: {
          Authorization: `Bearer ${encodeBase64(state.code)}`,
        },
      });

      if (!response.ok) {
        let message = 'That code was not recognized. Check the invitation and try again.';
        try {
          const data = await response.json();
          if (data && data.message) {
            message = data.message;
          }
        } catch {
          // ignore
        }
        state.status = 'error';
        state.loadError = message;
        render();
        return;
      }

      const data = await response.json();
      const names = Array.isArray(data.names) ? data.names : [];
      if (!names.length) {
        state.status = 'error';
        state.loadError = 'No guests are attached to that code. Reach out to the hosts for help.';
        render();
        return;
      }

      state.names = names;
      state.people = names.reduce((acc, personName) => {
        acc[personName] = createPersonState(personName);
        return acc;
      }, {});
      state.fieldErrors = {};
      const rsvps =
        data && typeof data.rsvps === 'object' && data.rsvps !== null
          ? data.rsvps
          : {};

      if (Object.keys(rsvps).length > 0) {
        state.summary = {
          rsvps,
          submittedAt: data && data.submittedAt,
          notice: 'existing',
          message: data && data.message ? data.message : 'We already have an RSVP for this code. Here’s what we saved.',
        };
        state.status = 'summary';
        state.submitStatus = 'idle';
        state.submitMessage = '';
        state.formError = '';
        render();
        return;
      }

      state.summary = null;
      state.status = 'ready';
      render();
    } catch (error) {
      console.error('Error fetching people', error);
      state.status = 'error';
      state.loadError = 'We were unable to connect to the RSVP service. Please try again in a moment.';
      render();
    }
  };

  const params = new URLSearchParams(window.location.search);
  const initialCode = (params.get('code') || '').trim();
  if (initialCode) {
    state.code = initialCode;
    state.status = 'loading';
  }

  render();

  if (initialCode) {
    fetchPeople();
  }
})();
