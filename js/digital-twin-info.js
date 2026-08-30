/* =========================================================
   DIGITAL TWIN INFO
   ========================================================= */

(() => {
    'use strict';


    /* =====================================================
       LOAD COMPONENT
       ===================================================== */

    const mount =
        document.getElementById(
            'digitalTwinInfoMount'
        );

    if (!mount) {
        return;
    }


    fetch('/components/digital-twin-info.html')
        .then(response => {

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}`
                );
            }

            return response.text();
        })

        .then(html => {

            mount.innerHTML = html;

            setupInfoSheet();

        })

        .catch(error => {

            console.error(
                'Digital Twin Info:',
                error
            );

        });


    /* =====================================================
       SETUP
       ===================================================== */

    function setupInfoSheet() {

        const infoButton =
            document.getElementById(
                'digitalTwinInfoBtn'
            );

        const overlay =
            document.getElementById(
                'digitalTwinInfoOverlay'
            );

        const sheet =
            document.getElementById(
                'digitalTwinInfoSheet'
            );

        const handle =
            document.getElementById(
                'digitalTwinInfoClose'
            );

        const header =
            document.querySelector(
                '.digital-twin-info-header'
            );


        if (
            !infoButton ||
            !overlay ||
            !sheet ||
            !handle
        ) {
            console.warn(
                'Digital Twin Info: missing element.'
            );

            return;
        }


        /* =================================================
           HISTORY STATE
           ================================================= */

        let infoHistoryActive = false;


        /* =================================================
           OPEN
           ================================================= */

        function open() {

            /*
             * Desktop:
             * position the info card relative to the
             * actual ⓘ button.
             */
            if (window.innerWidth > 768) {

                const rect =
                    infoButton.getBoundingClientRect();

                const gap = 10;


                sheet.style.top =
                    `${rect.bottom + gap}px`;

                sheet.style.right =
                    `${Math.max(
                        16,
                        window.innerWidth - rect.right
                    )}px`;
            }


            /*
             * Show the sheet.
             */
            overlay.classList.add(
                'active'
            );

            infoButton.setAttribute(
                'aria-expanded',
                'true'
            );

            overlay.setAttribute(
                'aria-hidden',
                'false'
            );

            document.body.style.overflow =
                'hidden';


            /*
             * Add a temporary browser-history entry.
             *
             * The URL does not change.
             *
             * This means the first Back action closes
             * the info sheet instead of leaving the
             * Digital Twin page.
             */
            if (!infoHistoryActive) {

                history.pushState(
                    {
                        ...(history.state || {}),
                        digitalTwinInfo: true
                    },
                    ''
                );

                infoHistoryActive = true;
            }
        }


        /* =================================================
           CLOSE UI
           ================================================= */

        function closeUI() {

            sheet.style.transform =
                '';

            sheet.style.top =
                '';

            sheet.style.right =
                '';

            sheet.style.transition =
                '';

            overlay.style.opacity =
                '';

            overlay.style.transition =
                '';


            overlay.classList.remove(
                'active'
            );


            infoButton.setAttribute(
                'aria-expanded',
                'false'
            );

            overlay.setAttribute(
                'aria-hidden',
                'true'
            );


            document.body.style.overflow =
                '';
        }


        /* =================================================
           CLOSE
           ================================================= */

        function close() {

            if (
                !overlay.classList.contains(
                    'active'
                )
            ) {
                return;
            }


            /*
             * If the sheet has a temporary history
             * entry, remove it first.
             *
             * The popstate handler will close the UI.
             */
            if (infoHistoryActive) {

                infoHistoryActive = false;

                history.back();

                return;
            }


            closeUI();
        }


        /* =================================================
           INFO BUTTON
           ================================================= */

        infoButton.addEventListener(
            'click',
            () => {

                if (
                    overlay.classList.contains(
                        'active'
                    )
                ) {
                    close();
                } else {
                    open();
                }

            }
        );


        /* =================================================
           BACKDROP
           ================================================= */

        overlay.addEventListener(
            'click',
            event => {

                if (
                    event.target === overlay
                ) {
                    close();
                }

            }
        );


        /* =================================================
           BROWSER BACK
           ================================================= */

        window.addEventListener(
            'popstate',
            () => {

                /*
                 * Back was pressed while the info sheet
                 * was open.
                 *
                 * Only close the sheet.
                 */
                if (!infoHistoryActive) {
                    return;
                }


                infoHistoryActive = false;

                closeUI();

            }
        );


        /* =================================================
           ESCAPE
           ================================================= */

        document.addEventListener(
            'keydown',
            event => {

                if (
                    event.key === 'Escape' &&
                    overlay.classList.contains(
                        'active'
                    )
                ) {
                    close();
                }

            }
        );


        /* =================================================
           KEEP DESKTOP SHEET ANCHORED ON RESIZE
           ================================================= */

        window.addEventListener(
            'resize',
            () => {

                if (
                    overlay.classList.contains(
                        'active'
                    ) &&
                    window.innerWidth > 768
                ) {

                    const rect =
                        infoButton.getBoundingClientRect();

                    const gap = 10;


                    sheet.style.top =
                        `${rect.bottom + gap}px`;

                    sheet.style.right =
                        `${Math.max(
                            16,
                            window.innerWidth - rect.right
                        )}px`;
                }

            }
        );


        /* =================================================
           DRAG TO DISMISS
           ================================================= */

        let dragging = false;

        let startY = 0;

        let currentY = 0;

        let didDrag = false;


        function startDrag(event) {

            if (
                !overlay.classList.contains(
                    'active'
                )
            ) {
                return;
            }


            dragging = true;

            didDrag = false;

            startY =
                event.clientY;

            currentY = 0;


            /*
             * Capture the pointer on whichever element
             * started the drag.
             *
             * This can be either:
             *   - the handle
             *   - the header
             */
            event.currentTarget.setPointerCapture(
                event.pointerId
            );


            sheet.style.transition =
                'none';

            overlay.style.transition =
                'none';


            event.preventDefault();
        }


        function moveDrag(event) {

            if (!dragging) {
                return;
            }


            currentY =
                Math.max(
                    0,
                    event.clientY - startY
                );


            if (currentY > 5) {
                didDrag = true;
            }


            sheet.style.transform =
                `translateY(${currentY}px)`;


            const progress =
                Math.min(
                    currentY / 300,
                    1
                );


            overlay.style.opacity =
                String(
                    1 -
                    progress * 0.6
                );


            event.preventDefault();
        }


        function endDrag() {

            if (!dragging) {
                return;
            }


            dragging = false;


            if (
                currentY >= 110
            ) {

                sheet.style.transition =
                    'transform 0.25s ease';

                overlay.style.transition =
                    'opacity 0.25s ease';


                sheet.style.transform =
                    'translateY(100%)';

                overlay.style.opacity =
                    '0';


                window.setTimeout(
                    close,
                    250
                );

            } else {

                sheet.style.transition =
                    'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)';

                overlay.style.transition =
                    'opacity 0.3s ease';


                sheet.style.transform =
                    'translateY(0)';

                overlay.style.opacity =
                    '1';
            }


            currentY = 0;
        }


        /* =================================================
           DRAG TARGETS
           ================================================= */

        const dragTargets = [
            handle,
            header
        ].filter(Boolean);


        dragTargets.forEach(
            target => {

                target.addEventListener(
                    'pointerdown',
                    startDrag
                );

                target.addEventListener(
                    'pointermove',
                    moveDrag
                );

                target.addEventListener(
                    'pointerup',
                    endDrag
                );

                target.addEventListener(
                    'pointercancel',
                    endDrag
                );

            }
        );


        /* =================================================
           HANDLE TAP
           ================================================= */

        handle.addEventListener(
            'click',
            () => {

                /*
                 * If the handle was dragged,
                 * don't treat the pointerup as a tap.
                 */
                if (didDrag) {
                    didDrag = false;
                    return;
                }


                close();

            }
        );
    }

})();