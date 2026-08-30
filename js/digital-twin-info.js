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
            * Get the position of the ⓘ button.
            */
            const buttonRect =
                infoButton.getBoundingClientRect();


            /*
            * Desktop:
            * Keep the sheet positioned below the
            * ⓘ button and aligned to its right edge.
            */
            if (window.innerWidth > 768) {

                const gap = 10;

                sheet.style.top =
                    `${buttonRect.bottom + gap}px`;

                sheet.style.right =
                    `${Math.max(
                        16,
                        window.innerWidth - buttonRect.right
                    )}px`;

            }


            /*
            * Mobile:
            * The sheet is already positioned at the bottom
            * by CSS.
            *
            * We temporarily make it visible so we can
            * calculate where the ⓘ button sits relative
            * to the sheet.
            */
            if (window.innerWidth <= 768) {

                /*
                * Temporarily make the sheet measurable.
                * It remains visually hidden because
                * scale is almost zero.
                */
                sheet.style.display =
                    'block';

                sheet.style.opacity =
                    '0';

                sheet.style.transform =
                    'scale(0.01)';


                const sheetRect =
                    sheet.getBoundingClientRect();


                /*
                * Calculate the ⓘ button's center relative
                * to the sheet.
                */
                const originX =
                    buttonRect.left +
                    (buttonRect.width / 2) -
                    sheetRect.left;

                const originY =
                    buttonRect.top +
                    (buttonRect.height / 2) -
                    sheetRect.top;


                /*
                * Make the sheet grow from the ⓘ button.
                */
                sheet.style.transformOrigin =
                    `${originX}px ${originY}px`;
            }


            /*
            * Prepare the opening animation.
            */
            sheet.style.transition =
                'none';

            sheet.style.transform =
                'scale(0.01)';

            overlay.style.transition =
                'opacity 0.45s ease';

            overlay.style.opacity =
                '0';


            /*
            * Make the overlay visible.
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


            /*
            * Let the browser render the starting
            * position before beginning the animation.
            */
            requestAnimationFrame(() => {

                requestAnimationFrame(() => {

                    sheet.style.transition =
                        'transform 0.65s cubic-bezier(0.22, 1, 0.36, 1)';

                    sheet.style.transform =
                        'scale(1)';

                    sheet.style.opacity =
                        '1';

                    overlay.style.opacity =
                        '1';

                });

            });


            /*
            * Add temporary browser history state.
            *
            * Back will close the info sheet first.
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

            dragging = false;
            didDrag = false;
            startY = 0;
            currentY = 0;

            sheet.style.transform = '';
            sheet.style.top = '';
            sheet.style.right = '';
            sheet.style.transition = '';

            overlay.style.opacity = '';
            overlay.style.transition = '';

            overlay.classList.remove('active');

            infoButton.setAttribute('aria-expanded', 'false');
            overlay.setAttribute('aria-hidden', 'true');
        }


        /* =================================================
           CLOSE
           ================================================= */

        function close() {

            if (
                !overlay.classList.contains('active')
            ) {
                return;
            }

            const shouldGoBack =
                infoHistoryActive;

            infoHistoryActive = false;

            closeUI();

            if (shouldGoBack) {
                history.back();
            }
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


        function endDrag(event) {

            if (!dragging) {
                return;
            }


            dragging = false;

            if (
                event &&
                event.currentTarget &&
                event.currentTarget.hasPointerCapture &&
                event.currentTarget.hasPointerCapture(event.pointerId)
            ) {
                event.currentTarget.releasePointerCapture(event.pointerId);
            }

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