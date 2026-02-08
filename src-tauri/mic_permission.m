#import <AVFoundation/AVFoundation.h>
#include <dispatch/dispatch.h>

// Request microphone permission from macOS TCC.
// Returns: 1 = authorized, 0 = denied/restricted, -1 = timeout
int request_microphone_permission(void) {
    AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];

    if (status == AVAuthorizationStatusAuthorized) {
        return 1;
    } else if (status == AVAuthorizationStatusNotDetermined) {
        __block int result = -1;
        dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);

        [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {
            result = granted ? 1 : 0;
            dispatch_semaphore_signal(semaphore);
        }];

        // Wait up to 60 seconds for the user to respond to the dialog
        dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 60LL * NSEC_PER_SEC));
        return result;
    } else {
        // Restricted or denied
        return 0;
    }
}

// Check current microphone authorization status without prompting.
// Returns: 0 = notDetermined, 1 = restricted, 2 = denied, 3 = authorized
int check_microphone_permission(void) {
    AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
    return (int)status;
}
