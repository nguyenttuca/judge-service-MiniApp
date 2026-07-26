#include <iostream>
#include <vector>

using namespace std;

void solve() {
    int n;
    cin >> n;
    
    int count_minus_one = 0;
    for (int i = 0; i < n; ++i) {
        int x;
        cin >> x;
        if (x == -1) {
            count_minus_one++;
        }
    }

    if (n % 2 != 0) {
        cout << "NO\n";
        return;
    }

    int target = n / 2;
    if ((count_minus_one % 2) == (target % 2)) {
        cout << "YES\n";
    } else {
        cout << "NO\n";
    }
}

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    int t;
    cin >> t;
    while (t--) {
        solve();
    }
    
    return 0;
}
